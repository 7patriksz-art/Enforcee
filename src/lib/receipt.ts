import { createHash } from 'node:crypto';
import type { Receipt } from './types';

export const RECEIPT_VERSION = '1' as const;

/** Deterministic JSON: keys sorted at every level, so the digest is reproducible. */
export function canonicalize(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      if (obj[k] === undefined) continue;
      out[k] = walk(obj[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Normalize before hashing text inputs so trivial whitespace edits don't change identity. */
export function hashText(s: string): string {
  return sha256(s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim());
}

export function digestOf(receipt: Omit<Receipt, 'digest'>): string {
  return sha256(canonicalize(receipt));
}

export function sealReceipt(receipt: Omit<Receipt, 'digest'>): Receipt {
  return { ...receipt, digest: digestOf(receipt) };
}

/** Recompute the digest from the receipt body and compare. Anyone can run this. */
export function verifyReceipt(receipt: Receipt): { valid: boolean; expected: string } {
  const { digest, ...body } = receipt;
  const expected = digestOf(body as Omit<Receipt, 'digest'>);
  return { valid: expected === digest, expected };
}

export function shortHash(h: string, n = 12): string {
  return h.slice(0, n);
}
