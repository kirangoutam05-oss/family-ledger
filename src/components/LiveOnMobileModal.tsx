import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Copy,
  Check,
  X,
  Share2,
  PlusSquare,
  ArrowRight,
  Send,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { DeviceInfo, Transaction, LedgerState } from '../types';

interface LiveOnMobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerState;
  currentDevice: DeviceInfo;
  onAddTransaction: (transaction: Transaction) => Promise<void>;
}

export const LiveOnMobileModal: React.FC<LiveOnMobileModalProps> = ({
  isOpen,
  onClose,
  ledger,
  currentDevice,
  onAddTransaction,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isSendingTestTx, setIsSendingTestTx] = useState(false);
  const [testSentMessage, setTestSentMessage] = useState<string | null>(null);

  // Determine the best live mobile URL
  const mobileUrl = typeof window !== 'undefined' ? window.location.href : '';

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

  // Quick live test: simulate an instant mobile UPI debit synced from phone
  const handleSendMobileTest = async () => {
    setIsSendingTestTx(true);
    setTestSentMessage(null);

    const isHusband = currentDevice.role === 'husband';
    const testAmount = Math.floor(Math.random() * 800) + 150;
    const testTx: Transaction = {
      id: `live-phone-${Date.now()}`,
      title: 'Blinkit Instant Groceries',
      amount: testAmount,
      type: 'debit',
      date: new Date().toISOString(),
      spender: isHusband ? 'husband' : 'wife',
      category: 'groceries',
      paymentMode: 'UPI',
      upiRef: `UPI/LiveMobile/${Math.floor(100000 + Math.random() * 900000)}`,
      bankName: 'HDFC Bank',
      rawSms: `Rs.${testAmount}.00 debited from HDFC a/c **4012 on ${new Date().toLocaleDateString()} to BLINKIT via UPI.`,
      status: 'verified',
      splitRatio: { husband: 50, wife: 50 },
      notes: 'Live phone test transaction',
    };

    try {
      await onAddTransaction(testTx);
      setTestSentMessage(`Sent ₹${testAmount} UPI debit from ${currentDevice.name}! Watch it sync across devices.`);
      setTimeout(() => setTestSentMessage(null), 5000);
    } finally {
      setIsSendingTestTx(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-lg w-full p-6 border border-black/[0.06] dark:border-white/[0.08] shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 relative">
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
              src="/app-logo.jpg?v=3"
              alt="Couple Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1 pr-6 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#007AFF] uppercase tracking-wider mb-0.5">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Open & Test on Your Mobile Device</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white leading-tight">
              Scan to Open on iPhone or Android
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Point your phone's camera at the QR code below to launch the live app immediately.
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

        {/* Live Cross-Device Test Trigger */}
        <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#007AFF]" />
              <span>Test Real-Time Sync</span>
            </span>
            <span className="text-[10px] text-neutral-400">
              Active: {currentDevice.name}
            </span>
          </div>

          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Click below to fire a simulated UPI debit right now and watch the balances update across both devices in real time.
          </p>

          <button
            onClick={handleSendMobileTest}
            disabled={isSendingTestTx}
            className="w-full py-2 px-3 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-50 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSendingTestTx ? 'Sending...' : 'Fire Live Test UPI Transaction'}</span>
          </button>

          {testSentMessage && (
            <div className="p-2.5 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] flex items-center gap-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{testSentMessage}</span>
            </div>
          )}
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
      </div>
    </div>
  );
};
