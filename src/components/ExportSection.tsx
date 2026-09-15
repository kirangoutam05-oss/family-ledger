import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, File, Table2, CheckCircle2, RefreshCw } from 'lucide-react';
import { Transaction, LedgerState, SpenderId, Category } from '../types';

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

export const ExportSection: React.FC<ExportSectionProps> = ({
  ledger,
  activeSpender,
  relevantTransactions,
  trendBuckets,
  categoryBarData,
}) => {
  const [justExported, setJustExported] = useState<ExportFormat | null>(null);
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  const scopeName =
    activeSpender === 'shared'
      ? 'the whole household'
      : activeSpender === 'husband'
      ? ledger.husbandName
      : ledger.wifeName;

  // The export libraries (xlsx, jsPDF) are ~700KB combined — loaded on demand
  // here instead of bundled into the app's initial load, since most sessions
  // never touch export.
  const handleExport = async (format: ExportFormat) => {
    if (relevantTransactions.length === 0 || isExporting) return;
    setIsExporting(format);
    try {
      const { exportCSV, exportXLSX, exportDOC, exportPDF } = await import('../utils/exporters');
      if (format === 'csv') exportCSV(relevantTransactions, ledger);
      else if (format === 'xlsx') exportXLSX(relevantTransactions, ledger);
      else if (format === 'doc') exportDOC(relevantTransactions, ledger);
      else exportPDF(relevantTransactions, ledger, ledger.currency, trendBuckets, categoryBarData);

      setJustExported(format);
      setTimeout(() => setJustExported(null), 2000);
    } catch (err) {
      console.error(`Failed to export ${format}:`, err);
    } finally {
      setIsExporting(null);
    }
  };

  const FORMATS: { id: ExportFormat; label: string; description: string; icon: React.ReactNode }[] = [
    { id: 'csv', label: 'CSV', description: 'Plain spreadsheet data', icon: <Table2 className="w-4 h-4" /> },
    { id: 'xlsx', label: 'XLSX', description: 'Excel workbook', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'pdf', label: 'PDF', description: 'Report with charts', icon: <FileText className="w-4 h-4" /> },
    { id: 'doc', label: 'DOC', description: 'Word document', icon: <File className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 px-1">
        <Download className="w-3.5 h-3.5" />
        <span>Export</span>
      </h2>

      <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Download {relevantTransactions.length} transaction{relevantTransactions.length === 1 ? '' : 's'} for {scopeName}, plus the
          category and trend charts above.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleExport(f.id)}
              disabled={relevantTransactions.length === 0 || isExporting !== null}
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

        {relevantTransactions.length === 0 && (
          <p className="text-[11px] text-neutral-400 text-center">Log an expense first — there's nothing to export yet.</p>
        )}
      </div>
    </div>
  );
};
