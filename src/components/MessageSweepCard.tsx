import React, { useRef, useState } from 'react';
import { MessageSquareText, ChevronRight, ChevronDown, Smartphone } from 'lucide-react';
import { LedgerState } from '../types';
import { formatAddedAgo } from '../utils/helpers';

// The name the shortcut must have on the phone. The link below finds it by
// name, so a different name opens an error in Shortcuts rather than anything
// in this app - which is why the setup text spells it out.
export const SWEEP_SHORTCUT_NAME = 'KNKU Sync';

// Ids of everything the SMS endpoint has filed. A web app has no way to read a
// phone's messages, so the scan itself runs in a Shortcut and posts what it
// finds to the server; the only thing this card can observe is the ledger
// changing, which is why "new from this sync" is worked out by comparing ids
// before and after rather than by being told.
const isFromMessages = (id: string) => id.startsWith('tx-sms-');

function isIphone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS reports itself as a Mac but still has a touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

interface MessageSweepCardProps {
  ledger: LedgerState;
  onReview: () => void;
}

export const MessageSweepCard: React.FC<MessageSweepCardProps> = ({ ledger, onReview }) => {
  const [launched, setLaunched] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const baselineIds = useRef<Set<string>>(new Set());

  // Everything that arrived from Messages and has not been confirmed yet. Not
  // keyed on the reason text: the parser sets its own reason on items it is
  // unsure of, so matching our wording would silently skip exactly those.
  const waiting = ledger.transactions.filter((t) => isFromMessages(t.id) && t.status === 'grey_area').length;

  const newFromThisSync = launched
    ? ledger.transactions.filter((t) => isFromMessages(t.id) && !baselineIds.current.has(t.id)).length
    : 0;

  const handleScan = () => {
    baselineIds.current = new Set(ledger.transactions.filter((t) => isFromMessages(t.id)).map((t) => t.id));
    setLaunched(true);
    // No x-success return link on purpose: an https address from Shortcuts
    // opens Safari, not this installed app, which would strand the person in
    // a browser tab. iOS already shows a "back to KNKU" link at the top of
    // the screen after jumping between apps.
    window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SWEEP_SHORTCUT_NAME);
  };

  const iphone = isIphone();

  return (
    <div className="bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#9333EA]/10 text-[#9333EA] flex items-center justify-center shrink-0">
          <MessageSquareText className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Scan my Messages</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Pulls in today&rsquo;s bank texts and sends them to Needs Context for you to confirm. Runs by itself near
            midnight too.
          </p>
        </div>
      </div>

      {iphone ? (
        <button
          type="button"
          onClick={handleScan}
          className="w-full py-3 rounded-xl bg-[#9333EA] hover:bg-[#7E22CE] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          Scan Messages now
        </button>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.05]">
          Scanning Messages runs from a shortcut on an iPhone. Open KNKU there to use it.
        </p>
      )}

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {ledger.lastMessageSyncAt
          ? 'Last scan ' + formatAddedAgo(new Date(ledger.lastMessageSyncAt).getTime())
          : 'No scan has reached the app yet.'}
      </p>

      {launched && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {newFromThisSync > 0
            ? newFromThisSync + ' new from this scan.'
            : 'Waiting for the scan to finish. New items show up here by themselves.'}
        </p>
      )}

      {waiting > 0 && (
        <button
          type="button"
          onClick={onReview}
          className="w-full p-3 rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between gap-3 text-left"
        >
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {waiting} from Messages {waiting === 1 ? 'is' : 'are'} waiting for you to confirm
          </span>
          <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowSetup((v) => !v)}
        className="w-full flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400"
      >
        <span>First time? How to set up the shortcut</span>
        <ChevronDown className={'w-4 h-4 transition-transform ' + (showSetup ? 'rotate-180' : '')} />
      </button>

      {showSetup && (
        <ol className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1.5 list-decimal pl-4">
          <li>
            In the Shortcuts app, make a shortcut named exactly <strong>{SWEEP_SHORTCUT_NAME}</strong>.
          </li>
          <li>It finds recent messages that mention a debit, spend or credit.</li>
          <li>
            It joins them with <code>~~~</code> between each and posts them to this app.
          </li>
          <li>Add a Time of Day trigger at 11:59 PM so it also runs on its own.</li>
          <li>
            Add Message triggers (contains &ldquo;debited&rdquo;, &ldquo;Spent&rdquo;) that run it with Run Immediately, so it
            syncs when a bank text arrives and you never need the button.
          </li>
        </ol>
      )}
    </div>
  );
};
