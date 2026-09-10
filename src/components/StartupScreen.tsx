import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Sparkles, ArrowRight, Lock } from 'lucide-react';

interface StartupScreenProps {
  onComplete: () => void;
  familyName?: string;
  husbandName?: string;
  wifeName?: string;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({
  onComplete,
  familyName = "Sharma Family",
  husbandName = "Arjun",
  wifeName = "Priya",
}) => {
  const [progress, setProgress] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);

  const statuses = [
    'Authenticating secure device session...',
    `Synchronizing shared vault for ${husbandName} & ${wifeName}...`,
    'Loading AI SMS categorizer & live balances...',
    'Household ledger ready.',
  ];

  useEffect(() => {
    // Smooth progress simulation over 1.8 seconds
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 350);
          return 100;
        }
        const increment = Math.floor(Math.random() * 12) + 8;
        const next = Math.min(100, prev + increment);

        if (next > 75) setStatusIndex(3);
        else if (next > 45) setStatusIndex(2);
        else if (next > 15) setStatusIndex(1);

        return next;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between p-6 sm:p-10 bg-[#F2F2F7] dark:bg-[#000000] text-neutral-900 dark:text-white select-none overflow-hidden"
    >
      {/* Top subtle badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="pt-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border border-black/[0.04] dark:border-white/[0.08] shadow-xs"
      >
        <Lock className="w-3.5 h-3.5 text-[#007AFF]" />
        <span className="text-[11px] font-medium tracking-wide text-neutral-600 dark:text-neutral-400">
          Encrypted Household Vault
        </span>
      </motion.div>

      {/* Main Center Content: Logo, App Name, Status */}
      <div className="flex flex-col items-center text-center max-w-sm w-full space-y-6 my-auto">
        {/* Apple Squircle Logo Container */}
        <motion.div
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative inline-flex flex-col items-center justify-center mx-auto group"
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 via-indigo-500/15 to-purple-500/20 rounded-[38px] blur-xl scale-110 pointer-events-none" />

          {/* Logo Frame */}
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-[28px] sm:rounded-[32px] overflow-hidden shadow-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center">
            <img
              src="/app-logo.jpg?v=3"
              alt="Couple Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Centered Symmetrical Verification Pill */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.35, type: 'spring' }}
            className="absolute -bottom-2.5 px-3 py-1 rounded-full bg-white dark:bg-neutral-900 shadow-md border border-black/[0.06] dark:border-white/[0.1] text-emerald-500 flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 fill-emerald-500 text-white dark:text-neutral-900" />
            <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 tracking-tight">
              Couple Vault
            </span>
          </motion.div>
        </motion.div>

        {/* App Title & Details */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="space-y-1.5"
        >
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Family Ledger
          </h1>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {familyName} • {husbandName} & {wifeName}
          </p>
        </motion.div>

        {/* Progress Bar & Status Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="w-full space-y-3 pt-2"
        >
          {/* Status Label */}
          <div className="h-5 flex items-center justify-center">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 transition-all">
              {statuses[statusIndex]}
            </span>
          </div>

          {/* Progress Track */}
          <div className="w-full h-1.5 bg-black/[0.06] dark:bg-white/[0.1] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#007AFF] rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.15 }}
            />
          </div>
        </motion.div>
      </div>

      {/* Bottom Controls */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="w-full max-w-xs flex flex-col items-center gap-3 pb-4"
      >
        <button
          onClick={onComplete}
          className="w-full py-2.5 px-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.06] dark:border-white/[0.08] hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-center gap-2 shadow-xs transition-colors"
        >
          <span>Enter Ledger</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#007AFF]" />
        </button>

        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <Sparkles className="w-3 h-3 text-[#007AFF]" />
          <span>Automated UPI & Split Intelligence</span>
        </div>
      </motion.div>
    </motion.div>
  );
};
