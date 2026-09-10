import React, { useState } from 'react';
import { X, CheckCircle2, ArrowRight, Smartphone, Scale } from 'lucide-react';
import { LedgerState, Transaction } from '../types';
import { formatCurrency } from '../utils/helpers';

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerState;
  onAddTransaction: (transaction: Transaction) => Promise<void>;
}

export const SettleUpModal: React.FC<SettleUpModalProps> = ({
  isOpen,
  onClose,
  ledger,
  onAddTransaction,
}) => {
  const { transactions, husbandName, wifeName, currency } = ledger;

  // Calculate shared balance
  let husbandPaid = 0;
  let wifePaid = 0;
  let husbandOwed = 0;
  let wifeOwed = 0;
  let settledFromWife = 0;
  let settledFromHusband = 0;

  transactions.forEach((tx) => {
    if (tx.type !== 'debit') return;

    if (tx.isSettlement) {
      if (tx.spender === 'wife') settledFromWife += tx.amount;
      else settledFromHusband += tx.amount;
      return;
    }

    const hPercent = tx.splitRatio.husband;
    const wPercent = tx.splitRatio.wife;

    if (!(hPercent === 100 && wPercent === 0) && !(wPercent === 100 && hPercent === 0)) {
      if (tx.spender === 'husband') husbandPaid += tx.amount;
      else wifePaid += tx.amount;

      husbandOwed += (tx.amount * hPercent) / 100;
      wifeOwed += (tx.amount * wPercent) / 100;
    }
  });

  const husbandNet = (husbandPaid - husbandOwed) - settledFromWife + settledFromHusband;
  const amountToSettle = Math.round(Math.abs(husbandNet));
  const payer = husbandNet > 0 ? wifeName : husbandName;
  const payee = husbandNet > 0 ? husbandName : wifeName;
  const payerId = husbandNet > 0 ? 'wife' : 'husband';

  const [paymentMode, setPaymentMode] = useState<'UPI' | 'NetBanking' | 'Cash'>('UPI');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirmSettlement = async () => {
    if (amountToSettle <= 0) return;
    setIsSubmitting(true);

    const settlementTx: Transaction = {
      id: `tx-settle-${Date.now()}`,
      title: `UPI Settlement: ${payer} settled with ${payee}`,
      amount: amountToSettle,
      type: 'debit',
      date: new Date().toISOString(),
      spender: payerId,
      category: 'bills',
      paymentMode,
      bankName: 'UPI Settlement',
      status: 'verified',
      isSettlement: true,
      splitRatio: {
        husband: 50,
        wife: 50,
      },
      notes: `Direct UPI transfer from ${payer} to ${payee} to settle household balance`,
    };

    try {
      await onAddTransaction(settlementTx);
      onClose();
    } catch (err) {
      console.error('Failed to record settlement:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl max-w-sm w-full p-6 border border-black/[0.08] dark:border-white/[0.08] shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Settle Household Balance
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {amountToSettle <= 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">
            All shared expenses are currently even! No balance owed.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
              <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                {payer} pays {payee}
              </div>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {formatCurrency(amountToSettle, currency)}
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Settles all shared household bills to a 50/50 balance.
              </p>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-xs font-semibold text-neutral-500 block mb-1">
                Settlement Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['UPI', 'NetBanking', 'Cash'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMode(m)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                      paymentMode === m
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {m === 'UPI' && <Smartphone className="w-3.5 h-3.5" />}
                    <span>{m}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleConfirmSettlement}
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Record & Rebalance Ledger</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
