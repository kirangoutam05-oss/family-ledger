import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Clock,
  History,
  Edit3,
  CalendarClock,
} from 'lucide-react';
import { Transaction, SpenderId, LedgerState, CategoryId } from '../types';
import { formatCurrency, formatDate, getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';

interface SmsUpiParserProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  onAddTransaction: (transaction: Transaction) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
}

export const SmsUpiParser: React.FC<SmsUpiParserProps> = ({
  ledger,
  activeSpender,
  onAddTransaction,
  onEditTransaction,
}) => {
  const [smsInput, setSmsInput] = useState('');
  const [selectedSpender, setSelectedSpender] = useState<SpenderId>(
    activeSpender === 'wife' ? 'wife' : 'husband'
  );
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Partial<Transaction> | null>(null);
  const [parseSource, setParseSource] = useState<'gemini' | 'heuristic' | null>(null);
  const [addedSuccess, setAddedSuccess] = useState(false);

  // When the parse comes back ambiguous, its context is resolved right here
  // in the same card instead of forcing a save-then-jump-to-Grey-Areas round
  // trip — this is what the category picker/note below feed.
  const [inlineCategory, setInlineCategory] = useState<CategoryId>('bills');
  const [inlineNote, setInlineNote] = useState('');
  const [inlineTitle, setInlineTitle] = useState('');

  const { categories, husbandName, wifeName, currency } = ledger;

  // Handler to parse SMS
  const handleParse = async (textToParse?: string) => {
    const text = textToParse || smsInput;
    if (!text.trim()) return;

    setIsParsing(true);
    setAddedSuccess(false);

    try {
      const res = await fetch('/api/parse-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smsText: text,
          defaultSpender: selectedSpender,
          husbandName,
          wifeName,
        }),
      });

      const data = await res.json();
      if (data.success && data.transaction) {
        setParsedPreview(data.transaction);
        setParseSource(data.source);
        if (data.transaction.status === 'grey_area') {
          setInlineCategory(
            data.transaction.category && data.transaction.category !== 'grey_area'
              ? data.transaction.category
              : 'bills'
          );
          setInlineNote('');
          setInlineTitle(data.transaction.title || '');
        }
      }
    } catch (err) {
      console.error('Failed to parse SMS:', err);
    } finally {
      setIsParsing(false);
    }
  };

  const isGreyArea = parsedPreview?.status === 'grey_area';

  // Add parsed transaction to ledger — an ambiguous ("grey area") parse is
  // resolved with the inline category/note right now, so it saves already
  // categorized instead of needing a second trip through Grey Areas.
  const handleConfirmAndAdd = async () => {
    if (!parsedPreview) return;

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      title: isGreyArea ? inlineTitle.trim() || parsedPreview.title || 'UPI Transaction' : parsedPreview.title || 'UPI Transaction',
      amount: parsedPreview.amount || 0,
      type: parsedPreview.type || 'debit',
      date: parsedPreview.date || new Date().toISOString(),
      spender: selectedSpender,
      category: isGreyArea ? inlineCategory : parsedPreview.category || 'bills',
      paymentMode: parsedPreview.paymentMode || 'UPI',
      upiRef: parsedPreview.upiRef,
      bankName: parsedPreview.bankName,
      rawSms: smsInput,
      status: isGreyArea ? 'verified' : parsedPreview.status || 'verified',
      notes: isGreyArea ? inlineNote.trim() : parsedPreview.notes || '',
    };

    await onAddTransaction(newTx);
    setAddedSuccess(true);
    setParsedPreview(null);
    setSmsInput('');
  };

  // Escape hatch for genuine ambiguity (e.g. needs the partner's input) —
  // saves it into the Grey Areas queue to resolve later instead of forcing
  // a category choice right now.
  const handleSaveForLater = async () => {
    if (!parsedPreview) return;

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      title: inlineTitle.trim() || parsedPreview.title || 'UPI Transaction',
      amount: parsedPreview.amount || 0,
      type: parsedPreview.type || 'debit',
      date: parsedPreview.date || new Date().toISOString(),
      spender: selectedSpender,
      category: 'grey_area',
      paymentMode: parsedPreview.paymentMode || 'UPI',
      upiRef: parsedPreview.upiRef,
      bankName: parsedPreview.bankName,
      rawSms: smsInput,
      status: 'grey_area',
      greyAreaReason: parsedPreview.greyAreaReason,
      contextQuestion: parsedPreview.contextQuestion,
      notes: '',
    };

    await onAddTransaction(newTx);
    setAddedSuccess(true);
    setParsedPreview(null);
    setSmsInput('');
  };

  const previewCat =
    categories.find((c) => c.id === (isGreyArea ? inlineCategory : parsedPreview?.category)) ||
    categories[0];

  // Newest-first is already the storage order (the server unshifts each new
  // add), so this reflects true add order even when a transaction's own date
  // is wrong — which is exactly the case this list exists to catch.
  const recentTransactions = ledger.transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Clean Header & Input Card */}
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              Import from SMS & UPI
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Paste bank alerts to automatically extract and categorize transactions.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-xl text-xs self-start sm:self-auto">
            <span className="text-neutral-400 px-2 text-[11px]">Paid by:</span>
            <button
              onClick={() => setSelectedSpender('husband')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                selectedSpender === 'husband'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {husbandName}
            </button>
            <button
              onClick={() => setSelectedSpender('wife')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                selectedSpender === 'wife'
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {wifeName}
            </button>
          </div>
        </div>

        {/* Text Input */}
        <div>
          <textarea
            value={smsInput}
            onChange={(e) => setSmsInput(e.target.value)}
            placeholder="Paste your bank or UPI alert here, e.g. &quot;Rs. 1,420 debited from HDFC a/c **4012 on 10-09-26 to BLINKIT via UPI&quot;"
            rows={3}
            className="w-full p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#007AFF] resize-none"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              Supports HDFC, ICICI, SBI, Axis, GPay, PhonePe, and Paytm
            </span>

            <button
              onClick={() => handleParse()}
              disabled={isParsing || !smsInput.trim()}
              className="px-4 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {isParsing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Categorizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Categorize</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Confirmation Toast */}
        {addedSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Transaction saved to the shared ledger.</span>
          </div>
        )}
      </div>

      {/* Extracted Preview Sheet */}
      {parsedPreview && (
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-blue-500/30 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Categorized Result
            </h3>
            <span className="text-[11px] text-neutral-400 font-mono">
              {parseSource === 'gemini' ? 'Gemini 3.8-Flash AI' : 'Smart Heuristics'}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: previewCat.color }}
              >
                {getCategoryIcon(previewCat.icon, 'w-5 h-5')}
              </div>

              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {isGreyArea ? inlineTitle || parsedPreview.title : parsedPreview.title}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5 flex-wrap">
                  <span>{getPaymentModeLabel(parsedPreview.paymentMode || 'UPI')}</span>
                  <span>•</span>
                  <span>{parsedPreview.bankName || 'Bank Alert'}</span>
                  <span>•</span>
                  <span>{selectedSpender === 'husband' ? husbandName : wifeName}</span>
                </div>
                {/* Parsed date/time — shown so a misread timestamp (the whole
                    reason this screen exists) is caught before saving, not after. */}
                <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  <CalendarClock className="w-3 h-3 shrink-0" />
                  <span>{formatDate(parsedPreview.date || new Date().toISOString())}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xl font-bold text-neutral-900 dark:text-white">
                {formatCurrency(parsedPreview.amount || 0, currency)}
              </div>
              <span className="text-xs text-neutral-500">
                {previewCat.name}
              </span>
            </div>
          </div>

          {/* Debit/Credit clarification — bank SMS often mention both sides
              of a UPI transfer (e.g. "Acct debited...; Payee credited"),
              so the auto-detected direction is always editable here. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              This was:
            </span>
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setParsedPreview({ ...parsedPreview, type: 'debit' })}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  (parsedPreview.type || 'debit') === 'debit'
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                Money Out (Debit)
              </button>
              <button
                type="button"
                onClick={() => setParsedPreview({ ...parsedPreview, type: 'credit' })}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  parsedPreview.type === 'credit'
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs font-semibold'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                Money In (Credit)
              </button>
            </div>
          </div>

          {/* Clarify inline, right here, instead of saving first and
              resolving on a separate Grey Areas screen. */}
          {isGreyArea && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 space-y-3">
              <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-semibold">Context needed: </span>
                  <span>{parsedPreview.contextQuestion || 'This looks like an ambiguous transfer — pick the real category below.'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amber-900 dark:text-amber-200 block">
                  Receiver of Payment
                </label>
                <input
                  type="text"
                  value={inlineTitle}
                  onChange={(e) => setInlineTitle(e.target.value)}
                  placeholder="Who was this paid to?"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-900/40 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amber-900 dark:text-amber-200 block">
                  Assign Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {categories
                    .filter((c) => c.id !== 'grey_area')
                    .map((cat) => {
                      const isChosen = inlineCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setInlineCategory(cat.id)}
                          className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 bg-white transition-all ${
                            isChosen ? 'ring-2 ring-blue-500 border-blue-200' : 'border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded-md flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: cat.color }}
                          >
                            {getCategoryIcon(cat.icon, 'w-2.5 h-2.5')}
                          </div>
                          <span className="truncate min-w-0 text-left text-neutral-900 font-medium">{cat.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-amber-900 dark:text-amber-200 block">
                  Context Note (Optional)
                </label>
                <input
                  type="text"
                  value={inlineNote}
                  onChange={(e) => setInlineNote(e.target.value)}
                  placeholder="e.g., Home maintenance, Electrician repair"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-900/40 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#007AFF]"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setParsedPreview(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Cancel
            </button>
            {isGreyArea && (
              <button
                onClick={handleSaveForLater}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-1.5 transition-colors"
                title="Not sure yet? Save it to Grey Areas and resolve it later."
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Not Sure — Save for Later</span>
              </button>
            )}
            <button
              onClick={handleConfirmAndAdd}
              className="px-4 py-1.5 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Save & Sync</span>
            </button>
          </div>
        </div>
      )}

      {/* Recently Added — every transaction added anywhere in the app (not
          just via this parser), newest first, so a bad parse or a fat-finger
          entry can be caught and fixed immediately instead of hunting for it
          later in Recent Activity. */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 px-1">
          <History className="w-3.5 h-3.5" />
          <span>Recently Added</span>
        </h2>

        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs overflow-hidden divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              Nothing added yet — it'll show up here as soon as you save one.
            </div>
          ) : (
            recentTransactions.map((tx) => {
              const cat = categories.find((c) => c.id === tx.category) || categories[0];
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onEditTransaction(tx)}
                  className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: cat.color }}
                    >
                      {getCategoryIcon(cat.icon, 'w-4 h-4')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                        {tx.title}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
                        <CalendarClock className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {formatDate(tx.date)} • {getPaymentModeLabel(tx.paymentMode)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <div
                        className={`text-xs font-semibold ${
                          tx.type === 'credit'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-neutral-900 dark:text-white'
                        }`}
                      >
                        {tx.type === 'credit' ? '+' : '-'}
                        {formatCurrency(tx.amount, currency)}
                      </div>
                      <div className="text-[10px] text-neutral-400">{cat.name}</div>
                    </div>
                    <Edit3 className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {recentTransactions.length > 0 && (
          <p className="text-[11px] text-neutral-400 px-1">
            Tap any entry to fix a wrong date, time, category, or amount.
          </p>
        )}
      </div>
    </div>
  );
};
