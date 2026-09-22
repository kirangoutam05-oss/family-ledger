import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, LedgerState, Category } from '../types';
import { formatDate, getPaymentModeLabel } from './helpers';

interface TrendBucket {
  key: string;
  label: string;
  amount: number;
}

interface CategoryBarRow {
  cat: Category;
  spent: number;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

const ROW_HEADERS = ['Date', 'Title', 'Amount', 'Type', 'Category', 'Paid By', 'Payment Mode', 'Notes'] as const;

function buildRows(transactions: Transaction[], ledger: LedgerState) {
  const { categories, husbandName, wifeName } = ledger;
  return transactions.map((tx) => {
    const cat = categories.find((c) => c.id === tx.category);
    return {
      Date: formatDate(tx.date),
      Title: tx.title,
      Amount: tx.amount,
      Type: tx.type,
      Category: cat?.name || tx.category,
      'Paid By': tx.spender === 'husband' ? husbandName : wifeName,
      'Payment Mode': getPaymentModeLabel(tx.paymentMode),
      Notes: tx.notes || '',
    };
  });
}

export function exportCSV(transactions: Transaction[], ledger: LedgerState) {
  const rows = buildRows(transactions, ledger);
  const escape = (val: unknown) => {
    const str = String(val ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [
    ROW_HEADERS.join(','),
    ...rows.map((r) => ROW_HEADERS.map((h) => escape(r[h])).join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `family-ledger-expenses-${dateStamp()}.csv`);
}

export function exportXLSX(transactions: Transaction[], ledger: LedgerState) {
  const rows = buildRows(transactions, ledger);
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...ROW_HEADERS] });
  ws['!cols'] = ROW_HEADERS.map((h) => ({ wch: h === 'Notes' || h === 'Title' ? 28 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `family-ledger-expenses-${dateStamp()}.xlsx`);
}

function escapeHtml(str: string) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// A .doc file that's actually HTML with Word-specific namespaces — Word (and
// Pages/Google Docs) opens this natively without needing the full docx
// binary format or an extra dependency to generate it.
export function exportDOC(transactions: Transaction[], ledger: LedgerState) {
  const rows = buildRows(transactions, ledger);
  const tableRows = rows
    .map(
      (r) =>
        `<tr>${ROW_HEADERS.map((h) => `<td style="border:1px solid #ccc;padding:4px 8px;">${escapeHtml(String(r[h]))}</td>`).join('')}</tr>`
    )
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>KNKU Export</title></head>
<body style="font-family:Calibri,Arial,sans-serif;">
  <h2>${escapeHtml(ledger.familyName)} — Expense Report</h2>
  <p style="color:#666;font-size:12px;">Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} • ${rows.length} transactions</p>
  <table style="border-collapse:collapse;width:100%;font-size:12px;">
    <thead><tr>${ROW_HEADERS.map((h) => `<th style="border:1px solid #ccc;padding:4px 8px;background:#f2f2f7;text-align:left;">${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  triggerDownload(blob, `family-ledger-expenses-${dateStamp()}.doc`);
}

export function exportPDF(
  transactions: Transaction[],
  ledger: LedgerState,
  currency: string,
  trendBuckets: TrendBucket[],
  categoryBarData: CategoryBarRow[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(`${ledger.familyName} — Expense Report`, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} • ${transactions.length} transactions`,
    14,
    24
  );

  let cursorY = 34;

  // Spending trend — simple bar chart drawn with jsPDF's own primitives
  // rather than snapshotting the DOM, so it renders identically wherever
  // this runs.
  if (trendBuckets.length > 0 && trendBuckets.some((b) => b.amount > 0)) {
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text('Spending Trend', 14, cursorY);
    cursorY += 6;

    const chartX = 14;
    const chartW = pageWidth - 28;
    const chartH = 36;
    const maxAmt = Math.max(...trendBuckets.map((b) => b.amount), 1);
    const barGap = 2;
    const barW = chartW / trendBuckets.length;

    trendBuckets.forEach((b, i) => {
      const barH = Math.max((b.amount / maxAmt) * chartH, b.amount > 0 ? 2 : 0);
      doc.setFillColor(10, 132, 255);
      doc.rect(chartX + i * barW + barGap / 2, cursorY + chartH - barH, barW - barGap, barH, 'F');
      doc.setFontSize(6);
      doc.setTextColor(120);
      doc.text(b.label, chartX + i * barW + barW / 2, cursorY + chartH + 5, { align: 'center' });
    });

    cursorY += chartH + 14;
  }

  // Amount vs Category — horizontal bars
  if (categoryBarData.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text('Amount vs Category', 14, cursorY);
    cursorY += 6;

    const barAreaW = pageWidth - 28 - 55;
    const maxCat = Math.max(...categoryBarData.map((r) => r.spent), 1);

    categoryBarData.slice(0, 8).forEach((row) => {
      const hex = row.cat.color.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) || 10;
      const g = parseInt(hex.slice(2, 4), 16) || 132;
      const b = parseInt(hex.slice(4, 6), 16) || 255;

      doc.setFontSize(8);
      doc.setTextColor(20);
      doc.text(row.cat.name, 14, cursorY + 3);

      const barW = Math.max((row.spent / maxCat) * barAreaW, 2);
      doc.setFillColor(r, g, b);
      doc.rect(70, cursorY, barW, 4, 'F');

      doc.setFontSize(7);
      doc.setTextColor(90);
      doc.text(`${currency}${row.spent.toLocaleString('en-IN')}`, 70 + barAreaW + 3, cursorY + 3.2);

      cursorY += 8;
    });

    cursorY += 6;
  }

  // Full transaction table
  const rows = buildRows(transactions, ledger);
  autoTable(doc, {
    startY: cursorY,
    head: [[...ROW_HEADERS]],
    body: rows.map((r) => ROW_HEADERS.map((h) => String(r[h]))),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [10, 132, 255], textColor: 255 },
    alternateRowStyles: { fillColor: [246, 246, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`family-ledger-expenses-${dateStamp()}.pdf`);
}
