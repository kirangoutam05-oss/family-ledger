import React from 'react';
import { motion } from 'motion/react';

// Shown only for the brief real gap between mount and the first ledger fetch
// resolving — no fabricated progress bar or rotating status copy (the old
// StartupScreen simulated ~1.8s of fake "Authenticating..."/"Syncing..." text
// on every open; this one just tells the truth about what's actually happening).
export const StartupScreen: React.FC = () => {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#F7F7FB] to-[#EBEBF0] dark:from-[#0A0A0C] dark:to-[#000000] text-neutral-900 dark:text-white">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-16 h-16 rounded-[22px] overflow-hidden shadow-lg border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-neutral-900 flex items-center justify-center"
      >
        <img
          src="/app-logo.jpg?v=4"
          alt="Family Ledger Logo"
          className="w-full h-full object-cover object-center block"
          referrerPolicy="no-referrer"
        />
      </motion.div>
      <div className="w-5 h-5 rounded-full border-2 border-neutral-300 dark:border-neutral-700 border-t-[#007AFF] animate-spin" />
    </div>
  );
};
