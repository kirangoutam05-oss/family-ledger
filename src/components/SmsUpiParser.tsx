import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Clock,
  Edit3,
  CalendarClock,
  HandCoins,
} from 'lucide-react';
import { Transaction, SpenderId, LedgerState, CategoryId } from '../types';
import { formatCurrency, formatDate, getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';
import { TransactionIcon } from './TransactionIcon';

interface SmsUpiParserProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  onAddTransaction: (transaction: Transaction) => Promise<void>;
  onEditTransaction: (transaction: Transaction) => void;
  onFlagPendingAck: (pending: {
    title: string;
    amount: number;
    category: CategoryId;
    paymentMode: Transaction['paymentMode'];
    notes?: string;
    bankName?: string;
    upiRef?: string;
    rawSms?: string;
    date: string;
    paidBy: SpenderId;
    paidFor: SpenderId;
  }) => Promise<void>;
}

export const SmsUpiParser: React.FC<SmsUpiParserProps> = ({
  ledger,
  activeSpender,
  onAddTransaction,
  onEditTransaction,
  onFlagPendingAck,
}) => {
  const [smsInput, setSmsInput] = useState('');
  const [selectedSpender, setSelectedSpender] = useState<SpenderId>(
    activeSpender === 'wife' ? 'wife' : 'husband'
  );
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Partial<Transaction> | null>(null);
  const [parseSource, setParseSource] = useState<'gemini' | 'heuristic' | null>(null);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [paidForOther, setPaidForOther] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setPaidForOther(false);

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
    // Guards against a double-tap (or a slow first click landing twice on
    // some touch devices) firing this twice before the confirm dialog closes
    // and re-adding the same transaction under a second, later `Date.now()` id.
    if (!parsedPreview || isSubmitting) return;
    setIsSubmitting(true);

    const title = isGreyArea
      ? inlineTitle.trim() || parsedPreview.title || 'UPI Transaction'
      : parsedPreview.title || 'UPI Transaction';
    const category = isGreyArea ? inlineCategory : parsedPreview.category || 'bills';
    const notes = isGreyArea ? inlineNote.trim() : parsedPreview.notes || '';

    try {
      if (paidForOther) {
        const otherSpender: SpenderId = selectedSpender === 'husband' ? 'wife' : 'husband';
        await onFlagPendingAck({
          title,
          amount: parsedPreview.amount || 0,
          category,
          paymentMode: parsedPreview.paymentMode || 'UPI',
          notes: notes || undefined,
          bankName: parsedPreview.bankName,
          upiRef: parsedPreview.upiRef,
          rawSms: smsInput,
          date: parsedPreview.date || new Date().toISOString(),
          paidBy: selectedSpender,
          paidFor: otherSpender,
        });
        setAddedSuccess(true);
        setParsedPreview(null);
        setSmsInput('');
        return;
      }

      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        title,
        amount: parsedPreview.amount || 0,
        type: parsedPreview.type || 'debit',
        date: parsedPreview.date || new Date().toISOString(),
        spender: selectedSpender,
        category,
        paymentMode: parsedPreview.paymentMode || 'UPI',
        upiRef: parsedPreview.upiRef,
        bankName: parsedPreview.bankName,
        rawSms: smsInput,
        status: isGreyArea ? 'verified' : parsedPreview.status || 'verified',
        notes,
      };

      await onAddTransaction(newTx);
      setAddedSuccess(true);
      setParsedPreview(null);
      setSmsInput('');
    } finally {
      setIsSubmitting(false);
      setShowConfirm(false);
    }
  };

  // Escape hatch for genuine ambiguity (e.g. needs the partner's input) —
  // saves it into the Grey Areas queue to resolve later instead of forcing
  // a category choice right now.
  const handleSaveForLater = async () => {
    if (!parsedPreview || isSubmitting) return;
    setIsSubmitting(true);

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

    try {
      await onAddTransaction(newTx);
      setAddedSuccess(true);
      setParsedPreview(null);
      setSmsInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewCat =
    categories.find((c) => c.id === (isGreyArea ? inlineCategory : parsedPreview?.category)) ||
    categories[0];

  // Newest-first is already the storage order (the server unshifts each new
  // add), so this reflects true add order even when a transaction's own date
  // is wrong — which is exactly the case this list exists to catch.
  const recentTransactions = ledger.transactions.slice(0, 5);

  // Parsed date/time, editable right in the preview — a wrong extraction
  // (or a bank that gives no date at all) should be fixable before saving,
  // not just after via Recently Added.
  const pad = (n: number) => String(n).padStart(2, '0');
  const previewDateObj = (() => {
    const d = parsedPreview?.date ? new Date(parsedPreview.date) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  })();
  const previewDateStr = `${previewDateObj.getFullYear()}-${pad(previewDateObj.getMonth() + 1)}-${pad(previewDateObj.getDate())}`;
  const previewTimeStr = `${pad(previewDateObj.getHours())}:${pad(previewDateObj.getMinutes())}`;

  const updatePreviewDateTime = (nextDateStr: string, nextTimeStr: string) => {
    if (!parsedPreview) return;
    const combined = new Date(`${nextDateStr}T${nextTimeStr}:00`);
    if (!isNaN(combined.getTime())) {
      setParsedPreview({ ...parsedPreview, date: combined.toISOString() });
    }
  };

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
            {(['husband', 'wife'] as const).map((spender) => (
              <button
                key={spender}
                onClick={() => setSelectedSpender(spender)}
                className="relative px-2.5 py-1 rounded-lg font-medium"
              >
                {selectedSpender === spender && (
                  <motion.span
                    layoutId="smsPaidByPill"
                    className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-lg shadow-xs"
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                  />
                )}
                <span
                  className={`relative z-10 transition-colors ${
                    selectedSpender === spender
                      ? 'text-neutral-900 dark:text-white font-semibold'
                      : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  {spender === 'husband' ? husbandName : wifeName}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Text Input */}
        <div>
          <textarea
            value={smsInput}
            onChange={(e) => setSmsInput(e.target.value)}
            placeholder="Paste your bank or UPI alert here, e.g. &quot;Rs. 1,420 debited from HDFC a/c **4012 on 10-09-26 to BLINKIT via UPI&quot;"
            rows={3}
            className="w-full p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#9333EA] resize-none"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-neutral-400">
              Supports HDFC, ICICI, SBI, Axis, GPay, PhonePe, and Paytm
            </span>

            <button
              onClick={() => handleParse()}
              disabled={isParsing || !smsInput.trim()}
              className="px-4 py-2 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
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
            <span>
              {paidForOther
                ? 'Sent for acknowledgement — it will count once accepted.'
                : 'Transaction saved to the shared ledger.'}
            </span>
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
              <TransactionIcon
                title={isGreyArea ? inlineTitle || parsedPreview.title || '' : parsedPreview.title || ''}
                bankName={parsedPreview.bankName}
                notes={parsedPreview.notes}
                category={previewCat}
                className="w-11 h-11 rounded-xl"
              />

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
              </div>
            </div>

            {/* Parsed date/time — editable right here, since a misread
                timestamp (the whole reason this screen exists) should be
                fixable before saving, not just after via Recently Added.
                Whatever's saved here is the same date every other screen
                (Overview, trends, category totals) reads — there's no
                separate copy to keep in sync. */}
            <div className="flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">When</span>
            </div>
            <div className="space-y-1.5">
              <input
                type="date"
                value={previewDateStr}
                onChange={(e) => updatePreviewDateTime(e.target.value, previewTimeStr)}
                className="w-full h-9 px-2.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-xs text-neutral-900 dark:text-white border-none focus:outline-none focus:ring-1 focus:ring-[#9333EA]"
              />
              <input
                type="time"
                value={previewTimeStr}
                onChange={(e) => updatePreviewDateTime(previewDateStr, e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-xs text-neutral-900 dark:text-white border-none focus:outline-none focus:ring-1 focus:ring-[#9333EA]"
              />
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
              {(['debit', 'credit'] as const).map((txType) => {
                const isActive = (parsedPreview.type || 'debit') === txType;
                return (
                  <button
                    key={txType}
                    type="button"
                    onClick={() => setParsedPreview({ ...parsedPreview, type: txType })}
                    className="relative px-3 py-1 rounded-md font-medium"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="smsTxTypePill"
                        className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-md shadow-xs"
                        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                      />
                    )}
                    <span
                      className={`relative z-10 transition-colors ${
                        isActive ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-500 dark:text-neutral-400'
                      }`}
                    >
                      {txType === 'debit' ? 'Money Out (Debit)' : 'Money In (Credit)'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paid for the other spouse — held aside until they acknowledge
              it, instead of landing straight in the ledger under this name. */}
          {(parsedPreview.type || 'debit') === 'debit' && (
            <button
              type="button"
              onClick={() => setPaidForOther((v) => !v)}
              className={`w-full p-3 rounded-xl border flex items-center gap-2.5 text-left transition-colors ${
                paidForOther
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/80'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  paidForOther
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                    : 'bg-black/5 dark:bg-white/10 text-neutral-500'
                }`}
              >
                <HandCoins className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-neutral-900 dark:text-white block leading-tight">
                  This was actually for {selectedSpender === 'husband' ? wifeName : husbandName}
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Held until they acknowledge it — then it counts as their spend
                </span>
              </div>
              <div
                className={`w-9 h-5 rounded-full shrink-0 relative transition-colors ${
                  paidForOther ? 'bg-amber-500' : 'bg-black/10 dark:bg-white/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                    paidForOther ? 'left-4' : 'left-0.5'
                  }`}
                />
              </div>
            </button>
          )}

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
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-900/40 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#9333EA]"
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
                          className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 bg-white dark:bg-neutral-800 transition-all ${
                            isChosen
                              ? 'ring-2 ring-blue-500 border-blue-200 dark:border-blue-800'
                              : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded-md flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: cat.color }}
                          >
                            {getCategoryIcon(cat.icon, 'w-2.5 h-2.5')}
                          </div>
                          <span className="truncate min-w-0 text-left text-neutral-900 dark:text-white font-medium">{cat.name}</span>
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
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-neutral-800 border border-amber-200 dark:border-amber-900/40 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#9333EA]"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setParsedPreview(null)}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-50"
            >
              Cancel
            </button>
            {isGreyArea && (
              <button
                onClick={handleSaveForLater}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Not sure yet? Save it to Grey Areas and resolve it later."
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Saving…' : 'Not Sure — Save for Later'}</span>
              </button>
            )}
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isSubmitting}
              className={`px-4 py-1.5 rounded-xl text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 ${
                paidForOther ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#9333EA] hover:bg-[#7E22CE]'
              }`}
            >
              {paidForOther ? <HandCoins className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>{paidForOther ? 'Send for Acknowledgement' : 'Save & Sync'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirm-before-save — a real pop-up rather than saving straight off
          the tap, so a double-tap or an accidental click can't silently add
          the same expense twice. */}
      {showConfirm && parsedPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && !isSubmitting && setShowConfirm(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="glass-sheet rounded-[24px] max-w-xs w-full p-5 border border-black/[0.06] dark:border-white/[0.1] space-y-4 text-center"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto ${
                paidForOther
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-[#9333EA]/10 text-[#9333EA]'
              }`}
            >
              {paidForOther ? <HandCoins className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                {paidForOther ? 'Send for acknowledgement?' : 'Add this expense?'}
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                "
                {isGreyArea
                  ? inlineTitle.trim() || parsedPreview.title || 'UPI Transaction'
                  : parsedPreview.title || 'UPI Transaction'}
                " — {formatCurrency(parsedPreview.amount || 0, currency)}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-lg border border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAndAdd}
                disabled={isSubmitting}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors ${
                  paidForOther ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#9333EA] hover:bg-[#7E22CE]'
                }`}
              >
                {isSubmitting ? 'Saving…' : paidForOther ? 'Send' : 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Recently Added — every transaction added anywhere in the app (not
          just via this parser), newest first, so a bad parse or a fat-finger
          entry can be caught and fixed immediately instead of hunting for it
          later in Recent Activity. */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-1">
          Recently Added
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
                    <TransactionIcon title={tx.title} bankName={tx.bankName} notes={tx.notes} category={cat} className="w-9 h-9 rounded-lg" iconClassName="w-4 h-4" />
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
