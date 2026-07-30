'use client';

import { useId } from 'react';

export const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const dayShort = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: 'short' });

export type TrendPoint = { date: string; value: number | null };
export type MeterTone = 'good' | 'warning' | 'serious' | 'critical';

const TONE_COLOR: Record<MeterTone, string> = {
  good: 'var(--chart-good)',
  warning: 'var(--chart-warning)',
  serious: 'var(--chart-serious)',
  critical: 'var(--chart-critical)',
};
const TONE_LABEL: Record<MeterTone, string> = { good: 'Saludable', warning: 'Para vigilar', serious: 'Alerta', critical: 'Crítico' };
const ORDINAL_RAMP = ['var(--chart-ordinal-1)', 'var(--chart-ordinal-2)', 'var(--chart-ordinal-3)', 'var(--chart-ordinal-4)', 'var(--chart-ordinal-5)'];

function formatByFormat(value: number, format: 'integer' | 'currency') {
  return format === 'currency' ? money.format(value) : number.format(value);
}

/** Meter thresholds are ascending; the value lands in the first band it clears. */
export function meterTone(bands: { min: number; tone: MeterTone }[], value: number): MeterTone {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((band) => value >= band.min)?.tone ?? sorted[sorted.length - 1]!.tone;
}

/** Single-series trend line for a stat tile: muted history, accent-colored latest step. Values already period-ordered. */
export function Sparkline({ points, accent, format = 'integer' }: { points: TrendPoint[]; accent: string; format?: 'integer' | 'currency' }) {
  const gradientId = useId();
  if (points.length < 2 || points.every((point) => point.value === null)) return <div className="h-8" aria-hidden="true" />;

  const values = points.map((point) => point.value ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const pad = 4;
  const stepX = width / (points.length - 1);
  const coords = values.map((value, index) => ({
    xPct: ((index * stepX) / width) * 100,
    yPct: ((pad + (height - pad * 2) * (1 - (value - min) / range)) / height) * 100,
  }));
  const toXY = (point: { xPct: number; yPct: number }) => `${((point.xPct / 100) * width).toFixed(1)},${((point.yPct / 100) * height).toFixed(1)}`;
  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${toXY(point)}`).join(' ');
  const areaPath = `${linePath} L${toXY(coords[coords.length - 1]!)} L${width},${height} L0,${height} Z`;
  const last = coords[coords.length - 1]!;
  const secondToLast = coords[coords.length - 2]!;
  const lastSegment = `M${toXY(secondToLast)} L${toXY(last)}`;

  return (
    <div className="relative h-8 w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke="var(--chart-line-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={lastSegment} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--card)]" style={{ left: `${last.xPct}%`, top: `${last.yPct}%`, background: accent }} />
      <div className="absolute inset-0 flex">
        {coords.map((_, index) => (
          <div
            key={points[index]!.date}
            tabIndex={0}
            title={`${dayShort.format(new Date(`${points[index]!.date}T12:00:00-03:00`))}: ${points[index]!.value === null ? 'sin datos' : formatByFormat(values[index]!, format)}`}
            aria-label={`${dayShort.format(new Date(`${points[index]!.date}T12:00:00-03:00`))}: ${points[index]!.value === null ? 'sin datos' : formatByFormat(values[index]!, format)}`}
            className="h-full flex-1 focus:outline-none"
          />
        ))}
      </div>
    </div>
  );
}

/** A single ratio against a target — the fill's color is the health signal, never the number alone. */
export function Meter({ value, tone, caption }: { value: number; tone: MeterTone; caption: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = TONE_COLOR[tone];
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-sm" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        <div className="h-full rounded-r-sm transition-[width] duration-700 ease-out" style={{ width: `${clamped}%`, background: color }} />
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="font-medium text-zinc-600">{TONE_LABEL[tone]}</span>
        <span className="text-zinc-400">· {caption}</span>
      </p>
    </div>
  );
}

/** The sales pipeline, in the order it actually happens. Width encodes count; color is purely ordinal (stage order). */
export function FunnelChart({ stages }: { stages: { id: string; label: string; value: number }[] }) {
  const max = Math.max(...stages.map((stage) => stage.value), 1);
  return (
    <div className="space-y-2.5">
      {stages.map((stage, index) => {
        const widthPct = Math.max(6, (stage.value / max) * 100);
        const previous = stages[index - 1];
        const dropRate = previous && previous.value > 0 ? ((previous.value - stage.value) / previous.value) * 100 : null;
        return (
          <div key={stage.id}>
            {dropRate !== null ? (
              <p className="mb-1 pl-1 text-[11px] text-zinc-400">
                {dropRate <= 0.5 ? 'sin caída respecto a la etapa anterior' : `${number.format(dropRate)}% no avanzó a esta etapa`}
              </p>
            ) : null}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="w-20 shrink-0 truncate text-xs font-medium text-zinc-600 sm:w-40" title={stage.label}>{stage.label}</span>
              <div className="h-4 min-w-0 flex-1 rounded-sm bg-zinc-100">
                <div
                  className="h-4 rounded-r-sm transition-[width] duration-700 ease-out"
                  style={{ width: `${widthPct}%`, background: ORDINAL_RAMP[index] ?? ORDINAL_RAMP[ORDINAL_RAMP.length - 1] }}
                  title={`${stage.label}: ${number.format(stage.value)}`}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-900 sm:w-16">{number.format(stage.value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Ranked magnitude comparison within one dimension — one hue for every bar, never a rank-based gradient. */
export function RankedBars({ items, format = 'number', emptyText = 'No hay información para este período.' }: { items: { id: string; label: string; value: number }[]; format?: 'number' | 'currency'; emptyText?: string }) {
  const max = Math.max(...items.map((item) => item.value), 0);
  if (!items.length) return <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 px-4 text-center text-sm text-zinc-500">{emptyText}</div>;
  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((item) => (
        <div key={item.id}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-zinc-700">{item.label}</span>
            <span className="shrink-0 tabular-nums text-zinc-500">{format === 'currency' ? money.format(item.value) : number.format(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-zinc-100">
            <div className="h-full rounded-r-sm transition-[width] duration-700 ease-out" style={{ width: `${max ? Math.max(3, (item.value / max) * 100) : 0}%`, background: 'var(--chart-blue)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
