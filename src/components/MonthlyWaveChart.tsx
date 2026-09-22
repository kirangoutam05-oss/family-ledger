import React from 'react';
import { Transaction, SpenderId } from '../types';
import { formatCurrency } from '../utils/helpers';

interface MonthlyWaveChartProps {
  transactions: Transaction[];
  husbandName: string;
  wifeName: string;
  currency: string;
  // "dark" is for embedding on a permanently-dark surface (the Overview
  // hero) regardless of the app's own light/dark theme — fixed light
  // labels/gridlines instead of the usual theme-conditional classes.
  variant?: 'auto' | 'dark';
}

const HUSBAND_COLOR = '#007AFF';
const WIFE_COLOR = '#A855F7';
const MONTHS_SHOWN = 4;

interface Point {
  x: number;
  y: number;
  amount: number;
  label: string;
}

// Catmull-Rom-ish smoothing (tension 1/6) — turns a handful of monthly totals
// into a flowing curve instead of a jagged connect-the-dots line, which is
// the whole point of a "wave" here.
function smoothLinePath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function smoothAreaPath(points: Point[], baselineY: number): string {
  const line = smoothLinePath(points);
  if (!line) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

// A monthly wave of this category's spend, split by who paid — shown inside
// a category's expanded detail so "is this trending up?" doesn't require
// scrolling through the raw transaction list and doing the math by hand.
export const MonthlyWaveChart: React.FC<MonthlyWaveChartProps> = ({
  transactions,
  husbandName,
  wifeName,
  currency,
  variant = 'auto',
}) => {
  const isDark = variant === 'dark';
  const legendText = isDark ? 'text-white/60' : 'text-neutral-500 dark:text-neutral-400';
  const gridStroke = isDark ? 'stroke-white/[0.1]' : 'stroke-black/[0.05] dark:stroke-white/[0.07]';
  const axisLabelFill = isDark ? 'fill-white/40' : 'fill-neutral-400 dark:fill-neutral-500';
  const emptyText = isDark ? 'text-white/40' : 'text-neutral-400';

  const now = new Date();
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      start,
      end,
    });
  }

  const totals = (spender: SpenderId) =>
    months.map((m) =>
      transactions
        .filter(
          (t) =>
            t.type === 'debit' &&
            t.spender === spender &&
            new Date(t.date) >= m.start &&
            new Date(t.date) < m.end
        )
        .reduce((sum, t) => sum + t.amount, 0)
    );

  const husbandTotals = totals('husband');
  const wifeTotals = totals('wife');
  const hasAnyData = husbandTotals.some((v) => v > 0) || wifeTotals.some((v) => v > 0);

  if (!hasAnyData) {
    return (
      <p className={`text-xs py-4 text-center ${emptyText}`}>
        Not enough history yet to chart a trend for this category.
      </p>
    );
  }

  const width = 520;
  const height = 160;
  const padTop = 14;
  const padBottom = 24;
  const padX = 8;
  const plotHeight = height - padTop - padBottom;
  const maxAmount = Math.max(...husbandTotals, ...wifeTotals, 1);
  const stepX = (width - padX * 2) / (months.length - 1 || 1);

  const toPoints = (values: number[]): Point[] =>
    values.map((amount, i) => ({
      x: padX + i * stepX,
      y: padTop + plotHeight - (amount / maxAmount) * plotHeight,
      amount,
      label: months[i].label,
    }));

  const husbandPoints = toPoints(husbandTotals);
  const wifePoints = toPoints(wifeTotals);
  const baselineY = padTop + plotHeight;

  return (
    <div className="pt-1">
      <div className={`flex items-center gap-3 text-[10.5px] mb-1.5 px-0.5 ${legendText}`}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: HUSBAND_COLOR }} />{husbandName}</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: WIFE_COLOR }} />{wifeName}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* Recessive gridlines — a quiet reference, not a focal element */}
        {[0.33, 0.66, 1].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={width - padX}
            y1={padTop + plotHeight * (1 - f)}
            y2={padTop + plotHeight * (1 - f)}
            className={gridStroke}
            strokeWidth={1}
          />
        ))}

        <path d={smoothAreaPath(wifePoints, baselineY)} fill={WIFE_COLOR} opacity={0.14} />
        <path d={smoothAreaPath(husbandPoints, baselineY)} fill={HUSBAND_COLOR} opacity={0.14} />

        <path d={smoothLinePath(wifePoints)} fill="none" stroke={WIFE_COLOR} strokeWidth={2} strokeLinecap="round" />
        <path d={smoothLinePath(husbandPoints)} fill="none" stroke={HUSBAND_COLOR} strokeWidth={2} strokeLinecap="round" />

        {[...wifePoints].map((p, i) => (
          <circle key={`w-${i}`} cx={p.x} cy={p.y} r={2.5} fill={WIFE_COLOR}>
            <title>{`${wifeName}, ${p.label}: ${formatCurrency(p.amount, currency)}`}</title>
          </circle>
        ))}
        {[...husbandPoints].map((p, i) => (
          <circle key={`h-${i}`} cx={p.x} cy={p.y} r={2.5} fill={HUSBAND_COLOR}>
            <title>{`${husbandName}, ${p.label}: ${formatCurrency(p.amount, currency)}`}</title>
          </circle>
        ))}

        {months.map((m, i) => (
          <text
            key={m.key}
            x={padX + i * stepX}
            y={height - 6}
            textAnchor="middle"
            className={axisLabelFill}
            style={{ fontSize: 9 }}
          >
            {m.label}
          </text>
        ))}
      </svg>
    </div>
  );
};
