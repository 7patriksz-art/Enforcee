/**
 * Cost metering. Every model call Enforcio makes is priced and written to a ledger,
 * because pricing for the product is set from measured unit cost, not guesswork.
 *
 * Rates are USD per 1M tokens. Update via ENFORCIO_PRICE_OVERRIDES (JSON) without a deploy.
 */

export interface Rate {
  input: number;
  output: number;
}

const DEFAULT_RATES: Record<string, Rate> = {
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
};

/** Used when a model id is unknown, so an unpriced call is never silently free. */
const FALLBACK: Rate = { input: 3, output: 15 };

let overrides: Record<string, Rate> | null = null;
function rates(): Record<string, Rate> {
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
  return { ...DEFAULT_RATES, ...overrides };
}

export function rateFor(model: string): { rate: Rate; exact: boolean } {
  const table = rates();
  if (table[model]) return { rate: table[model], exact: true };
  // Match on the longest known prefix, e.g. "claude-sonnet-4-5-20250929".
  const key = Object.keys(table)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  if (key) return { rate: table[key], exact: true };
  return { rate: FALLBACK, exact: false };
}

export function priceOf(model: string, inputTokens: number, outputTokens: number): number {
  const { rate } = rateFor(model);
  const usd = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * 1e6) / 1e6;
}

export function totalUsd(entries: { usd: number }[]): number {
  return Math.round(entries.reduce((a, b) => a + b.usd, 0) * 1e6) / 1e6;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}
