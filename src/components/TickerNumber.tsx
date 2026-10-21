import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

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
const DigitColumn: React.FC<DigitColumnProps> = ({ digit, delay, instant }) => {
  const target = `${-digit * SLOT_EM}em`;
  return (
    <span
      aria-hidden
      style={{ display: 'inline-block', height: `${SLOT_EM}em`, lineHeight: `${SLOT_EM}em`, overflow: 'hidden' }}
    >
      <motion.span
        style={{ display: 'block' }}
        initial={{ y: instant ? target : '0em' }}
        animate={{ y: target }}
        transition={{ duration: instant ? 0 : 1.15, ease: [0.16, 1, 0.3, 1], delay }}
      >
        {DIGITS.map((n) => (
          <span key={n} style={{ display: 'block', height: `${SLOT_EM}em` }}>
            {n}
          </span>
        ))}
      </motion.span>
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
  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

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
            delay={firstRender.current ? startDelay + digitIndex * 0.07 : 0}
            instant={!!reduceMotion}
          />
        );
      })}
    </span>
  );
};
