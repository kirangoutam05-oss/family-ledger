import React, { useRef, useState } from 'react';
import { motion, useAnimationControls, useMotionValue, useTransform } from 'motion/react';
import { Trash2 } from 'lucide-react';

// How far the row slides to expose the Delete button.
const REVEAL_PX = 88;

interface SwipeToDeleteProps {
  onDelete: () => Promise<void> | void;
  // Rows this person cannot delete (the other spouse's) are left as plain
  // rows rather than offering a swipe that would only be refused.
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

// Swipe a row left to expose a red Delete button; tap it to remove the row.
//
// Deleting takes that second tap on purpose. A swipe happens by accident while
// scrolling a long list, and a transaction that vanishes on a stray flick is
// worse than one extra tap. A tap on the row while it is open closes it again
// instead of opening whatever the row normally opens.
export const SwipeToDelete: React.FC<SwipeToDeleteProps> = ({ onDelete, disabled, className = '', children }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragged = useRef(false);
  const x = useMotionValue(0);
  const controls = useAnimationControls();
  // The red panel only appears once the row has actually started to move, so
  // it never shows at the rounded corners of a row that is at rest.
  const panelOpacity = useTransform(x, [-6, 0], [1, 0]);

  if (disabled) return <div className={className}>{children}</div>;

  const settle = (toOpen: boolean) => {
    setOpen(toOpen);
    controls.start({ x: toOpen ? -REVEAL_PX : 0, transition: { type: 'spring', stiffness: 500, damping: 40 } });
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } catch {
      // The delete handler has already told the person what went wrong.
    } finally {
      setBusy(false);
      settle(false);
    }
  };

  return (
    <div className={'relative overflow-hidden ' + className}>
      <motion.button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        aria-label="Delete"
        style={{ opacity: panelOpacity, width: REVEAL_PX }}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-red-500 text-white text-[11px] font-semibold disabled:opacity-70"
      >
        <Trash2 className="w-4 h-4" />
        {busy ? 'Deleting…' : 'Delete'}
      </motion.button>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -REVEAL_PX, right: 0 }}
        dragElastic={0.1}
        dragMomentum={false}
        animate={controls}
        style={{ x, touchAction: 'pan-y' }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          settle(x.get() < -REVEAL_PX / 2 || info.velocity.x < -500);
          // The click that follows a drag must not open the row.
          setTimeout(() => {
            dragged.current = false;
          }, 0);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.stopPropagation();
            e.preventDefault();
          } else if (open) {
            e.stopPropagation();
            e.preventDefault();
            settle(false);
          }
        }}
        className="relative bg-white dark:bg-neutral-900"
      >
        {children}
      </motion.div>
    </div>
  );
};
