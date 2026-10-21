import React, { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

// Height of one digit slot, in em, so the column scales with whatever font size
// the number is set in.
const SLOT_EM = 1.12;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

interface DigitColumnProps {
  digit: number;
  // Seconds to wait before this column starts rolling. Only used on the first
  // appearance, so the digits settle one after another; a later change rolls
  // straight away.
  delay: number;
  instant: boolean;
}

// One column of 0-9 behind a one-slot window. Rolling to a digit slides the
// whole stack up, so a 7 travels past 1-6 on its way and a 1 hardly moves,
// which is what makes the settle look like a mechanical counter.
//
// The roll is started from an effect, not from motion's `initial`/`animate`
// props. The app wraps its screens in an AnimatePresence told to skip initial
// animations for whatever is on screen at first load, and that setting reaches
// every motion component inside: the columns were created already sitting on
// their final digit and nothing ever rolled. Driving the element directly does
// not go through that.
const DigitColumn: React.FC<DigitColumnProps> = ({ digit, delay, instant }) => {
  const stackRef = useRef<HTMLSpanElement>(null);
  // Becomes true once a roll has actually finished, so an effect that is torn
  // down and run again before then (strict mode in development, or the value
  // changing mid-roll) still gets its staggered start.
  const settledRef = useRef(false);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    // Positions in pixels, measured, so a roll that is interrupted by a new
    // value carries on from wherever the stack actually is.
    const slotPx = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height || 0;
    const targetPx = -digit * slotPx;
    if (instant || slotPx === 0) {
      el.style.transform = `translateY(${targetPx}px)`;
      return;
    }
    const currentPx = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const controls = animate(
      el,
      { y: [currentPx, targetPx] },
      {
        duration: 1.15,
        ease: [0.16, 1, 0.3, 1],
        delay: settledRef.current ? 0 : delay,
        onComplete: () => {
          settledRef.current = true;
        },
      }
    );
    return () => controls.stop();
  }, [digit, instant]);

  return (
    <span
      aria-hidden
      style={{ display: 'inline-block', height: `${SLOT_EM}em`, lineHeight: `${SLOT_EM}em`, overflow: 'hidden' }}
    >
      <span ref={stackRef} style={{ display: 'block', transform: 'translateY(0px)' }}>
        {DIGITS.map((n) => (
          <span key={n} style={{ display: 'block', height: `${SLOT_EM}em` }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  );
};

interface TickerNumberProps {
  // Already formatted, e.g. "5,959.33" - commas and the decimal point stay put
  // and only the digits roll.
  value: string;
  className?: string;
  // Seconds before the first roll begins, so it can follow a card's own fade-in.
  startDelay?: number;
}

export const TickerNumber: React.FC<TickerNumberProps> = ({ value, className, startDelay = 0.3 }) => {
  const reduceMotion = useReducedMotion();

  const chars = value.split('');
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  let digitIndex = -1;

  return (
    <span
      role="img"
      aria-label={value}
      className={className}
      style={{ display: 'inline-flex', fontVariantNumeric: 'tabular-nums' }}
    >
      {chars.map((c, i) => {
        if (!/\d/.test(c)) {
          return (
            <span
              key={`s${chars.length - i}`}
              aria-hidden
              style={{ display: 'inline-block', height: `${SLOT_EM}em`, lineHeight: `${SLOT_EM}em` }}
            >
              {c}
            </span>
          );
        }
        digitIndex += 1;
        // Columns are keyed from the right, so when the number gains or loses a
        // digit the ones that remain keep rolling instead of being rebuilt.
        const fromRight = digitCount - 1 - digitIndex;
        return (
          <DigitColumn
            key={`d${fromRight}`}
            digit={Number(c)}
            delay={startDelay + digitIndex * 0.07}
            instant={!!reduceMotion}
          />
        );
      })}
    </span>
  );
};
