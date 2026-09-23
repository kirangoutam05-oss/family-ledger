import React, { useRef, useState } from 'react';
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
// Same overall span as before (the last 4 calendar months), just bucketed by
// week instead of by month — more points to scrub through on hover without
// reaching further back in history than the user asked to see.
const RANGE_MONTHS_BACK = 4;

interface Point {
  x: number;
  y: number;
  amount: number;
  // What the hover tooltip shows for this point — a date range, e.g. "Jun 1 – 7".
  tooltipLabel: string;
}

// Catmull-Rom-ish smoothing (tension 1/6) — turns a run of weekly totals into
// a flowing curve instead of a jagged connect-the-dots line, which is the
// whole point of a "wave" here.
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

function mondayOf(d: Date): Date {
  const monday = new Date(d);
  const day = monday.getDay();
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// A weekly wave of this category's spend, split by who paid — shown inside a
// category's expanded detail so "is this trending up?" doesn't require
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
  const axisLabelFill = isDark ? 'fill-white/55' : 'fill-neutral-500 dark:fill-neutral-400';
  const guideStroke = isDark ? 'stroke-white/25' : 'stroke-black/15 dark:stroke-white/20';
  const emptyText = isDark ? 'text-white/40' : 'text-neutral-400';
  // The dark variant's tooltip used to be bg-white/10 — mostly transparent,
  // so the chart's own lines/gradient showed straight through and muddied
  // the white text behind it. backdrop-blur hides whatever's underneath
  // instead of just tinting it, so the text stays legible regardless of
  // what part of the chart the tooltip happens to sit over.
  const tooltipBg = isDark
    ? 'bg-neutral-800/90 backdrop-blur-md border-white/15'
    : 'bg-neutral-900 border-black/10 dark:bg-neutral-800';

  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Weekly (Monday-start) buckets spanning the last RANGE_MONTHS_BACK months —
  // same overall window as the old monthly view, just finer-grained so a
  // hover/drag reveals each week's total, not only each month's.
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (RANGE_MONTHS_BACK - 1), 1);
  const weeks: { key: string; axisLabel: string; tooltipLabel: string; start: Date; end: Date }[] = [];
  let cursor = mondayOf(rangeStart);
  let lastAxisMonth = -1;
  while (cursor <= now) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 7);
    const weekEndDisplay = new Date(end);
    weekEndDisplay.setDate(weekEndDisplay.getDate() - 1);

    const isNewMonth = start.getMonth() !== lastAxisMonth;
    if (isNewMonth) lastAxisMonth = start.getMonth();

    weeks.push({
      key: `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`,
      axisLabel: isNewMonth ? start.toLocaleDateString('en-US', { month: 'short' }) : '',
      tooltipLabel: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEndDisplay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      start,
      end,
    });

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  const totals = (spender: SpenderId) =>
    weeks.map((w) =>
      transactions
        .filter(
          (t) =>
            t.type === 'debit' &&
            t.spender === spender &&
            new Date(t.date) >= w.start &&
            new Date(t.date) < w.end
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
  const stepX = (width - padX * 2) / (weeks.length - 1 || 1);

  const toPoints = (values: number[]): Point[] =>
    values.map((amount, i) => ({
      x: padX + i * stepX,
      y: padTop + plotHeight - (amount / maxAmount) * plotHeight,
      amount,
      tooltipLabel: weeks[i].tooltipLabel,
    }));

  const husbandPoints = toPoints(husbandTotals);
  const wifePoints = toPoints(wifeTotals);
  const baselineY = padTop + plotHeight;

  // Current (rightmost) week's total for each spender — the headline
  // numbers, shown next to their name in the legend instead of on the chart
  // itself, where a floating label over the line was hard to read at a
  // glance and could collide with the other series.
  const lastHusband = husbandPoints[husbandPoints.length - 1];
  const lastWife = wifePoints[wifePoints.length - 1];

  // Touch/drag scrubbing — maps a pointer's screen position to the nearest
  // week, converting through the SVG's own viewBox since it renders at
  // `w-full` (a different pixel size than the 520x160 coordinate space).
  const updateActiveFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const index = Math.round((svgX - padX) / stepX);
    setActiveIndex(Math.min(Math.max(index, 0), weeks.length - 1));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateActiveFromClientX(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.buttons === 0 && e.pointerType !== 'touch') return;
    updateActiveFromClientX(e.clientX);
  };
  const clearActive = () => setActiveIndex(null);

  const activeHusband = activeIndex !== null ? husbandPoints[activeIndex] : null;
  const activeWife = activeIndex !== null ? wifePoints[activeIndex] : null;
  // Flip the tooltip to the left edge once the scrub point is past the
  // midpoint, so it never runs off the right side of the chart.
  const tooltipOnLeft = activeIndex !== null && activeIndex > (weeks.length - 1) / 2;

  return (
    <div className="pt-1">
      <div className={`flex items-center gap-4 text-[10.5px] mb-1.5 px-0.5 ${legendText}`}>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: HUSBAND_COLOR }} />
          <span>{husbandName}</span>
          <span className="font-bold" style={{ color: HUSBAND_COLOR }}>
            {formatCurrency(lastHusband.amount, currency)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: WIFE_COLOR }} />
          <span>{wifeName}</span>
          <span className="font-bold" style={{ color: WIFE_COLOR }}>
            {formatCurrency(lastWife.amount, currency)}
          </span>
        </span>
      </div>
      <div className="relative">
        {activeIndex !== null && activeHusband && activeWife && (
          <div
            className={`absolute z-10 top-0 rounded-lg border px-2.5 py-2 text-[10.5px] leading-tight shadow-lg pointer-events-none ${tooltipBg}`}
            style={{
              left: tooltipOnLeft ? undefined : `${(activeHusband.x / width) * 100}%`,
              right: tooltipOnLeft ? `${100 - (activeHusband.x / width) * 100}%` : undefined,
              transform: tooltipOnLeft ? 'translate(8px, 0)' : 'translate(-8px, 0)',
              color: isDark ? '#fff' : undefined,
            }}
          >
            <div className={`font-semibold mb-1 whitespace-nowrap ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>
              {activeHusband.tooltipLabel}
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: HUSBAND_COLOR }} />
              <span className="font-semibold">{formatCurrency(activeHusband.amount, currency)}</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: WIFE_COLOR }} />
              <span className="font-semibold">{formatCurrency(activeWife.amount, currency)}</span>
            </div>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto touch-none select-none"
          preserveAspectRatio="none"
        >
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

          {activeIndex !== null && (
            <line
              x1={padX + activeIndex * stepX}
              x2={padX + activeIndex * stepX}
              y1={padTop}
              y2={baselineY}
              className={guideStroke}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {[...wifePoints].map((p, i) => (
            <circle
              key={`w-${i}`}
              cx={p.x}
              cy={p.y}
              r={activeIndex === i ? 4 : 2}
              fill={WIFE_COLOR}
              stroke={isDark ? '#050308' : 'white'}
              strokeWidth={activeIndex === i ? 1.5 : 0}
              className="transition-[r]"
            />
          ))}
          {[...husbandPoints].map((p, i) => (
            <circle
              key={`h-${i}`}
              cx={p.x}
              cy={p.y}
              r={activeIndex === i ? 4 : 2}
              fill={HUSBAND_COLOR}
              stroke={isDark ? '#050308' : 'white'}
              strokeWidth={activeIndex === i ? 1.5 : 0}
              className="transition-[r]"
            />
          ))}

          {weeks.map(
            (w, i) =>
              w.axisLabel && (
                <text
                  key={w.key}
                  x={padX + i * stepX}
                  y={height - 6}
                  textAnchor="middle"
                  className={`${axisLabelFill} font-medium`}
                  style={{ fontSize: 12 }}
                >
                  {w.axisLabel}
                </text>
              )
          )}

          {/* Invisible scrub surface — sits on top, spans the full plot so a
              touch/drag anywhere across the chart (not just exactly on the
              line) tracks the nearest week. */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearActive}
            onPointerLeave={clearActive}
            onPointerCancel={clearActive}
          />
        </svg>
      </div>
    </div>
  );
};
