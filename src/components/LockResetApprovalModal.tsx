import React, { useState } from 'react';
import { motion } from 'motion/react';
import { KeyRound, Check, XCircle } from 'lucide-react';
import { LockResetRequest, LedgerState } from '../types';

interface LockResetApprovalModalProps {
  request: LockResetRequest;
  ledger: LedgerState;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
}

export const LockResetApprovalModal: React.FC<LockResetApprovalModalProps> = ({
  request,
  ledger,
  onClose,
  onApprove,
  onDeny,
}) => {
  const requesterName = request.requestedBy === 'husband' ? ledger.husbandName : ledger.wifeName;
  const [isApproving, setIsApproving] = useState(false);
  const [isDenying, setIsDenying] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove(request.id);
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeny = async () => {
    setIsDenying(true);
    try {
      await onDeny(request.id);
    } finally {
      setIsDenying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="glass-sheet rounded-[28px] max-w-sm w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-5"
      >
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">{requesterName} forgot their PIN</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              They're locked out of the app on their device. Approve to let them set a new PIN there.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDeny}
            disabled={isDenying || isApproving}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            <span>{isDenying ? 'Denying…' : 'Deny'}</span>
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving || isDenying}
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] active:scale-95 text-white text-sm font-semibold shadow-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{isApproving ? 'Approving…' : 'Approve'}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
