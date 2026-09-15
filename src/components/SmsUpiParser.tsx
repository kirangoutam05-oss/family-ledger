import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { Transaction, SpenderId, LedgerState } from '../types';
import { formatCurrency, getCategoryIcon, getPaymentModeLabel } from '../utils/helpers';

interface SmsUpiParserProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  onAddTransaction: (transaction: Transaction) => Promise<void>;
  onResolveGreyArea: (transactionId: string) => void;
}

export const SmsUpiParser: React.FC<SmsUpiParserProps> = ({
  ledger,
  activeSpender,
  onAddTransaction,
  onResolveGreyArea,
}) => {
  const [smsInput, setSmsInput] = useState('');
  const [selectedSpender, setSelectedSpender] = useState<SpenderId>(
    activeSpender === 'wife' ? 'wife' : 'husband'
  );
  const [isParsing, setIsParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Partial<Transaction> | null>(null);
  const [parseSource, setParseSource] = useState<'gemini' | 'heuristic' | null>(null);
  const [addedSuccess, setAddedSuccess] = useState(false);

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
      }
    } catch (err) {
      console.error('Failed to parse SMS:', err);
    } finally {
      setIsParsing(false);
    }
  };

  // Add parsed transaction to ledger
  const handleConfirmAndAdd = async () => {
    if (!parsedPreview) return;

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      title: parsedPreview.title || 'UPI Transaction',
      amount: parsedPreview.amount || 0,
      type: parsedPreview.type || 'debit',
      date: new Date().toISOString(),
      spender: selectedSpender,
      category: parsedPreview.category || 'bills',
      paymentMode: parsedPreview.paymentMode || 'UPI',
      upiRef: parsedPreview.upiRef,
      bankName: parsedPreview.bankName,
      rawSms: smsInput,
      status: parsedPreview.status || 'verified',
      greyAreaReason: parsedPreview.greyAreaReason,
      contextQuestion: parsedPreview.contextQuestion,
      notes: parsedPreview.notes || '',
    };

    await onAddTransaction(newTx);
    setAddedSuccess(true);
    setParsedPreview(null);
    setSmsInput('');

    // If it was a grey area, auto-trigger the context modal
    if (newTx.status === 'grey_area') {
      setTimeout(() => {
        onResolveGreyArea(newTx.id);
      }, 400);
    }
  };

  const previewCat =
    categories.find((c) => c.id === parsedPreview?.category) || categories[0];

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
                style={{
                  backgroundColor:
                    parsedPreview.status === 'grey_area' ? '#FF9500' : previewCat.color,
                }}
              >
                {getCategoryIcon(previewCat.icon, 'w-5 h-5')}
              </div>

              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {parsedPreview.title}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                  <span>{getPaymentModeLabel(parsedPreview.paymentMode || 'UPI')}</span>
                  <span>•</span>
                  <span>{parsedPreview.bankName || 'Bank Alert'}</span>
                  <span>•</span>
                  <span>{selectedSpender === 'husband' ? husbandName : wifeName}</span>
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

          {/* Grey Area Alert Callout */}
          {parsedPreview.status === 'grey_area' && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-semibold">Context Required: </span>
                <span>{parsedPreview.contextQuestion || 'Ambiguous payment. You can provide context after adding.'}</span>
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
    </div>
  );
};
