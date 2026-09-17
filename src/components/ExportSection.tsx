import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, FileSpreadsheet, FileText, File, Table2, CheckCircle2, RefreshCw, X, ChevronRight } from 'lucide-react';
import { Transaction, LedgerState, SpenderId, Category } from '../types';
import { localDateKey } from '../utils/helpers';

interface TrendBucket {
  key: string;
  label: string;
  amount: number;
}

interface CategoryBarRow {
  cat: Category;
  spent: number;
}

interface ExportSectionProps {
  ledger: LedgerState;
  activeSpender: SpenderId | 'shared';
  relevantTransactions: Transaction[];
  trendBuckets: TrendBucket[];
  trendGranularity: 'day' | 'week' | 'month';
  categoryBarData: CategoryBarRow[];
}

type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'doc';

const FORMATS: { id: ExportFormat; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'csv', label: 'CSV', description: 'Plain spreadsheet data', icon: <Table2 className="w-4 h-4" /> },
  { id: 'xlsx', label: 'XLSX', description: 'Excel workbook', icon: <FileSpreadsheet className="w-4 h-4" /> },
  { id: 'pdf', label: 'PDF', description: 'Report with charts', icon: <FileText className="w-4 h-4" /> },
  { id: 'doc', label: 'DOC', description: 'Word document', icon: <File className="w-4 h-4" /> },
];

export const ExportSection: React.FC<ExportSectionProps> = ({
  ledger,
  activeSpender,
  relevantTransactions,
  trendBuckets,
  categoryBarData,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [justExported, setJustExported] = useState<ExportFormat | null>(null);
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const scopeName =
    activeSpender === 'shared'
      ? 'the whole household'
      : activeSpender === 'husband'
      ? ledger.husbandName
      : ledger.wifeName;

  // Date range is optional — an empty From/To means "everything in scope",
  // same as before this had a picker at all.
  const filteredTransactions = relevantTransactions.filter((tx) => {
    const key = localDateKey(new Date(tx.date));
    if (dateFrom && key < dateFrom) return false;
    if (dateTo && key > dateTo) return false;
    return true;
  });

  // The export libraries (xlsx, jsPDF) are ~700KB combined — loaded on demand
  // here instead of bundled into the app's initial load, since most sessions
  // never touch export.
  const handleExport = async (format: ExportFormat) => {
    if (filteredTransactions.length === 0 || isExporting) return;
    setIsExporting(format);
    try {
      const { exportCSV, exportXLSX, exportDOC, exportPDF } = await import('../utils/exporters');
      if (format === 'csv') exportCSV(filteredTransactions, ledger);
      else if (format === 'xlsx') exportXLSX(filteredTransactions, ledger);
      else if (format === 'doc') exportDOC(filteredTransactions, ledger);
      else exportPDF(filteredTransactions, ledger, ledger.currency, trendBuckets, categoryBarData);

      setJustExported(format);
      setTimeout(() => setJustExported(null), 2000);
    } catch (err) {
      console.error(`Failed to export ${format}:`, err);
    } finally {
      setIsExporting(null);
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    setJustExported(null);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 px-1">
        <Download className="w-3.5 h-3.5" />
        <span>Export</span>
      </h2>

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3 hover:border-[#007AFF]/40 dark:hover:border-[#007AFF]/40 transition-colors active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <Download className="w-4.5 h-4.5" />
          </div>
          <div className="text-left min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Export Data</div>
            <div className="text-xs text-neutral-400 truncate">CSV, Excel, PDF, or Word — pick a date range first</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="glass-sheet rounded-t-[28px] sm:rounded-[28px] max-w-md w-full p-6 border border-black/[0.06] dark:border-white/[0.1] space-y-5 max-h-[88dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">Export Data</h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">For {scopeName}</p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Date range — stacked full-width, not side-by-side: native
                  date inputs carry their own internal minimum render width
                  that can overflow a narrow column on a real device. */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Date range <span className="font-normal text-neutral-400">(optional — leave blank for everything)</span>
                </label>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-neutral-400 block mb-1">From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-xs text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-[#007AFF] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400 block mb-1">To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-xs text-neutral-900 dark:text-white border-none focus:ring-1 focus:ring-[#007AFF] outline-none"
                    />
                  </div>
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="text-[11px] font-medium text-[#007AFF]"
                  >
                    Clear dates
                  </button>
                )}
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'} will be included, plus the
                category and trend charts above.
              </p>

              {/* Format */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">File format</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {FORMATS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleExport(f.id)}
                      disabled={filteredTransactions.length === 0 || isExporting !== null}
                      className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-[#007AFF] dark:hover:border-[#007AFF] disabled:opacity-40 disabled:hover:border-neutral-200 dark:disabled:hover:border-neutral-700 bg-white dark:bg-neutral-800/60 transition-all active:scale-[0.97] flex flex-col items-center gap-1.5 text-center"
                    >
                      {isExporting === f.id ? (
                        <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                      ) : justExported === f.id ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span className="text-neutral-600 dark:text-neutral-300">{f.icon}</span>
                      )}
                      <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                        {isExporting === f.id ? 'Preparing…' : justExported === f.id ? 'Saved' : f.label}
                      </span>
                      <span className="text-[10px] text-neutral-400 leading-tight">{f.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {filteredTransactions.length === 0 && (
                <p className="text-[11px] text-neutral-400 text-center">
                  No transactions match that date range — try widening it or clearing it.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
