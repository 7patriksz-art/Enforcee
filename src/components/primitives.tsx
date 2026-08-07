import clsx from 'clsx';
import type { Method, Verdict } from '@/lib/types';

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string; glyph: string }> = {
  FOLLOWED: { label: 'Followed', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', glyph: '✓' },
  VIOLATED: { label: 'Violated', cls: 'bg-red-50 text-red-800 ring-red-600/20', glyph: '✕' },
  NOT_APPLICABLE: { label: 'Not applicable', cls: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20', glyph: '–' },
  UNVERIFIABLE: { label: 'Unverifiable', cls: 'bg-amber-50 text-amber-800 ring-amber-600/20', glyph: '?' },
};

export function VerdictChip({ verdict, className }: { verdict: Verdict; className?: string }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        s.cls,
        className
      )}
    >
      <span className="font-mono leading-none">{s.glyph}</span>
      {s.label}
    </span>
  );
}

const METHOD_COPY: Record<Method, { label: string; title: string }> = {
  deterministic: {
    label: 'proof',
    title: 'Checked by code. No model was involved. Re-running this gives the identical result.',
  },
  judged: {
    label: 'judged',
    title: 'Adjudicated by a model. Its evidence quote was verified to exist literally in the output, or the verdict was rejected.',
  },
  structural: {
    label: 'structural',
    title: 'Derived from the ruleset itself, without inspecting the output.',
  },
};

export function MethodBadge({ method }: { method: Method }) {
  const m = METHOD_COPY[method];
  return (
    <span
      title={m.title}
      className={clsx(
        'inline-flex shrink-0 cursor-help items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
        method === 'deterministic' && 'border-emerald-600/25 bg-emerald-50/60 text-emerald-800',
        method === 'judged' && 'border-brand/25 bg-blue-50/60 text-brand-deep',
        method === 'structural' && 'border-neutral-300 bg-neutral-50 text-neutral-500'
      )}
    >
      {m.label}
    </span>
  );
}

export function Hash({ value, label }: { value: string; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 font-mono text-[11px] text-skip" title={value}>
      {label && <span className="text-neutral-400">{label}</span>}
      <span className="text-neutral-600">{value.slice(0, 16)}…</span>
    </span>
  );
}

export function Stat({
  value,
  label,
  hint,
  tone = 'neutral',
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  return (
    <div className="rounded-lg border hairline bg-white px-4 py-3">
      <div
        className={clsx(
          'font-mono text-[26px] leading-none tracking-tight',
          tone === 'good' && 'text-pass',
          tone === 'bad' && 'text-fail',
          tone === 'warn' && 'text-unknown',
          tone === 'neutral' && 'text-ink'
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12px] font-medium text-neutral-700">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-skip">{hint}</div>}
    </div>
  );
}
