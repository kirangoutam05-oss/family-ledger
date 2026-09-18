import React, { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { SpenderId } from '../types';
import {
  isPushSupported,
  isSubscribedToPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '../utils/push';

interface NotificationSettingsProps {
  authenticatedUser: SpenderId;
}

// Push opt-in for this device — a daily reminder to log expenses if you
// haven't, and a heads-up the moment your partner adds one. This is the
// explicit permission moment: nothing here calls Notification.requestPermission
// until the person taps "Enable".
export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ authenticatedUser }) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isSubscribedToPush().then(setIsSubscribed);
  }, []);

  if (!isPushSupported()) {
    return null;
  }

  const handleEnable = async () => {
    setIsBusy(true);
    setError(null);
    const ok = await subscribeToPush(authenticatedUser);
    setIsBusy(false);
    if (ok) {
      setIsSubscribed(true);
    } else {
      setError(
        Notification.permission === 'denied'
          ? 'Notifications are blocked for this app in your browser/phone settings.'
          : "Couldn't enable notifications on this device."
      );
    }
  };

  const handleDisable = async () => {
    setIsBusy(true);
    setError(null);
    await unsubscribeFromPush(authenticatedUser);
    setIsBusy(false);
    setIsSubscribed(false);
  };

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isSubscribed ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
            }`}
          >
            {isSubscribed ? <BellRing className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Notifications</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {isSubscribed
                ? 'Daily reminders and expense alerts on this device'
                : "Get nudged if you haven't logged today, and when your partner adds an expense"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={isSubscribed ? handleDisable : handleEnable}
          disabled={isBusy}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 disabled:opacity-50 ${
            isSubscribed
              ? 'border border-black/[0.08] dark:border-white/[0.12] text-neutral-700 dark:text-neutral-300 hover:border-red-400 hover:text-red-500'
              : 'bg-[#007AFF] hover:bg-[#0071E3] text-white'
          }`}
        >
          {isBusy ? 'Working…' : isSubscribed ? 'Turn Off' : 'Enable'}
        </button>
      </div>

      {error && (
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          {error}
        </div>
      )}
    </div>
  );
};
