/**
 * Cost metering. Every model call Enforcio makes is priced and written to a ledger,
 * because the product's price is set from measured unit cost, not guesswork.
 *
 * Rates are USD per 1M tokens, taken from platform.claude.com/docs/en/about-claude/pricing
 * (checked 2026-08-07). Override without a deploy via ENFORCIO_PRICE_OVERRIDES (JSON).
 */

export interface Rate {
  input: number;
  output: number;
  /** Cache read is 0.1x base input across the range. */
  cacheRead: number;
  /** 5-minute cache write is 1.25x base input. */
  cacheWrite: number;
}

function rate(input: number, output: number): Rate {
  return {
    input,
    output,
    cacheRead: Math.round(input * 0.1 * 1e4) / 1e4,
    cacheWrite: Math.round(input * 1.25 * 1e4) / 1e4,
  };
}

const DEFAULT_RATES: Record<string, Rate> = {
  'claude-fable-5': rate(10, 50),
  'claude-mythos-5': rate(10, 50),
  'claude-opus-5': rate(5, 25),
  'claude-opus-4-8': rate(5, 25),
  'claude-opus-4-7': rate(5, 25),
  'claude-opus-4-6': rate(5, 25),
  'claude-opus-4-5': rate(5, 25),
  'claude-opus-4-1': rate(15, 75),
  // Sonnet 5 introductory pricing runs through 2026-08-31, then $3/$15.
  'claude-sonnet-5': rate(2, 10),
  'claude-sonnet-4-6': rate(3, 15),
  'claude-sonnet-4-5': rate(3, 15),
  'claude-haiku-4-5': rate(1, 5),
  'claude-haiku-3-5': rate(0.8, 4),
};

/** Sonnet 5 leaves introductory pricing on this date. */
export const SONNET_5_STANDARD_FROM = Date.UTC(2026, 8, 1);

/** Used when a model id is unknown, so an unpriced call is never silently free. */
const FALLBACK: Rate = rate(5, 25);

let overrides: Record<string, Rate> | null = null;
function table(): Record<string, Rate> {
  if (overrides === null) {
    overrides = {};
    const raw = process.env.ENFORCIO_PRICE_OVERRIDES;
    if (raw) {
      try {
        overrides = JSON.parse(raw) as Record<string, Rate>;
      } catch {
        overrides = {};
      }
    }
  }
  const base = { ...DEFAULT_RATES };
  if (Date.now() >= SONNET_5_STANDARD_FROM) base['claude-sonnet-5'] = rate(3, 15);
  return { ...base, ...overrides };
}

export function rateFor(model: string): { rate: Rate; exact: boolean } {
  const t = table();
  if (t[model]) return { rate: t[model], exact: true };
  // Longest known prefix, e.g. "claude-sonnet-4-5-20250929".
  const key = Object.keys(t)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (key) return { rate: t[key], exact: true };
  return { rate: FALLBACK, exact: false };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function priceOf(model: string, usage: Usage | number, outputTokens?: number): number {
  const u: Usage =
    typeof usage === 'number' ? { inputTokens: usage, outputTokens: outputTokens ?? 0 } : usage;
  const { rate: r } = rateFor(model);
  const usd =
    (u.inputTokens / 1e6) * r.input +
    (u.outputTokens / 1e6) * r.output +
    ((u.cacheReadTokens ?? 0) / 1e6) * r.cacheRead +
    ((u.cacheWriteTokens ?? 0) / 1e6) * r.cacheWrite;
  return Math.round(usd * 1e8) / 1e8;
}

export function totalUsd(entries: { usd: number }[]): number {
  return Math.round(entries.reduce((a, b) => a + b.usd, 0) * 1e8) / 1e8;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.0001) return `<$0.0001`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}
