import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Copy,
  Check,
  X,
  Share2,
  PlusSquare,
  ExternalLink,
} from 'lucide-react';

interface LiveOnMobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteUrl: string;
}

export const LiveOnMobileModal: React.FC<LiveOnMobileModalProps> = ({ isOpen, onClose, inviteUrl }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // The household-specific invite link — scanning/opening it joins THIS
  // household, not just a bare install of the app.
  const mobileUrl = inviteUrl;

  useEffect(() => {
    if (!mobileUrl) return;
    QRCode.toDataURL(mobileUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#1C1C1E',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [mobileUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mobileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="glass-sheet rounded-[28px] max-w-lg w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-5 relative max-h-[92dvh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-xs border border-black/[0.08] dark:border-white/[0.1] shrink-0 flex items-center justify-center">
            <img
              src="/app-logo.jpg?v=4"
              alt="Couple Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1 pr-6 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#007AFF] uppercase tracking-wider mb-0.5">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Invite Your Partner</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white leading-tight">
              Scan to Join Your Household
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Have your partner point their phone's camera at this QR code to join this household on their own device.
            </p>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-[#F2F2F7] dark:bg-neutral-800/60 border border-black/[0.04] dark:border-white/[0.06]">
          <div className="bg-white p-3 rounded-2xl shadow-xs shrink-0 flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to open on phone"
                className="w-44 h-44 rounded-xl"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center text-xs text-neutral-400">
                Generating QR...
              </div>
            )}
          </div>

          <div className="space-y-3 w-full">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <span>1. Camera Scan</span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Open Camera on your phone and tap the yellow banner to launch.
              </p>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <PlusSquare className="w-3.5 h-3.5 text-[#007AFF]" />
                <span>2. Add to Home Screen (iOS)</span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Tap <Share2 className="w-3 h-3 inline text-neutral-600 dark:text-neutral-300" /> Share in Safari, then tap <strong>"Add to Home Screen"</strong> for a native standalone app experience.
              </p>
            </div>

            {/* Action Buttons: Copy Link & Open in Tab */}
            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-neutral-700 border border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-neutral-800 dark:text-white flex items-center justify-center gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-650 transition-colors shadow-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              <a
                href={mobileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Full Tab</span>
              </a>
            </div>
          </div>
        </div>

        {/* URL Link Preview */}
        <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
          <span className="truncate max-w-[280px] font-mono">{mobileUrl}</span>
          <a
            href={mobileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[#007AFF] hover:underline flex items-center gap-1 font-medium shrink-0"
          >
            <span>Open in New Tab</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
};
