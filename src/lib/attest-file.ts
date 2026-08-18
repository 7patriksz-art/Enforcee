import { attest, verifyAttestation, type SignedReceipt, type AttestationOutcome } from './attest';
import { generateLicenceKeypair } from './licence';
import type { Receipt, RuleResult } from './types';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The document layer between `attest.ts` and the two commands.
 *
 * `attest.ts` speaks in objects and knows nothing about files, which is right for the crypto
 * and useless to the person this feature exists for: somebody who was handed a JSON file and
 * a key by a supplier and wants a yes or a no. Everything that turns bytes into that answer
 * lives here — parsing, the coverage denominator, and the sentences describing what the
 * answer does and does not prove — so that the CLI is a printer and the tests can drive the
 * whole path without a subprocess.
 *
 * WHY THIS SHIPPED SEVEN DAYS LATE. `src/lib/attest.ts` and its fourteen tests were written on
 * 2026-08-11 and were green every day since, while `enforcee.com/pricing` sold *"Signed
 * receipts you can hand to a client"* on the $290/year tier and no surface in the product
 * could sign anything. The only importer of `attest()` in the entire repository was its own
 * test file. A test that imports the only caller of the code it tests is a mirror, not a
 * control (`76-ENGINE-PLAN` CHANGE 3), and this is the recorded instance that cost the most.
 */

/**
 * Where the signing key lives by default.
 *
 * Beside the licence, in `~/.enforcee/`, because that is the directory this product has
 * already taught people about. Built with `join` rather than a `/` literal — INVARIANTS E-2,
 * five separator bugs, every one of them caught only by the Windows leg of CI.
 */
export const ATTESTATION_KEY_PATHS = {
  privateKey: join(homedir(), '.enforcee', 'attestation-key'),
  publicKey: join(homedir(), '.enforcee', 'attestation-key.pub'),
};

/** Ed25519, generated on the user's machine. Nothing is sent anywhere, ever. */
export function generateAttestationKeypair(): { publicKey: string; privateKey: string } {
  return generateLicenceKeypair();
}

export type ParsedDocument =
  | { kind: 'signed'; signed: SignedReceipt }
  | { kind: 'receipt'; receipt: Receipt }
  | { kind: 'unreadable'; reason: string };

/**
 * Work out what somebody actually handed us, without throwing.
 *
 * A stranger running `enforcee check` will point it at the wrong file at least once. The
 * difference between "that is not JSON", "that is JSON but not a receipt" and "that is a
 * receipt but nobody signed it" is the whole of the help they need, so it is three answers.
 */
export function parseReceiptDocument(raw: string): ParsedDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (err) {
    return { kind: 'unreadable', reason: `That file is not JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'unreadable', reason: 'That file holds JSON, but not an object — a receipt is a JSON object.' };
  }

  const obj = value as Record<string, unknown>;
  if (obj.attestation && obj.receipt && typeof obj.receipt === 'object') {
    return { kind: 'signed', signed: obj as unknown as SignedReceipt };
  }
  if (looksLikeReceipt(obj)) return { kind: 'receipt', receipt: obj as unknown as Receipt };

  return {
    kind: 'unreadable',
    reason: 'That JSON object is not an Enforcee receipt — it has no `results` array and no `digest`. Produce one with `enforcee audit <rules> <output> --json`.',
  };
}

function looksLikeReceipt(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.results) && typeof obj.digest === 'string';
}

/**
 * What the signature actually covers, counted rather than asserted.
 *
 * `INVARIANTS.md` E-3: every check reports its own coverage and fails when that coverage is
 * implausibly low. A signature over a receipt that grades zero rules is cryptographically
 * perfect and evidentially empty, and printing a green tick over it would be this product
 * telling a client that nothing has been checked, in the voice it uses for good news.
 */
export interface Covers {
  rules: number;
  followed: number;
  violated: number;
  unverifiable: number;
  notApplicable: number;
}

export function coversOf(receipt: Receipt): Covers {
  const results: RuleResult[] = Array.isArray(receipt?.results) ? receipt.results : [];
  const count = (v: string) => results.filter((r) => r?.verdict === v).length;
  return {
    rules: results.length,
    followed: count('FOLLOWED'),
    violated: count('VIOLATED'),
    unverifiable: count('UNVERIFIABLE'),
    notApplicable: count('NOT_APPLICABLE'),
  };
}

export interface CheckReport {
  /** The answer a client acts on. Combines the signature with what it covers. */
  outcome: AttestationOutcome;
  /** The signature considered on its own, before coverage is taken into account. */
  signature: AttestationOutcome;
  reason: string;
  digest: string | null;
  signedAt: string | null;
  covers: Covers | null;
  /** Stated in the output every time, because a receipt is read by somebody who did not run it. */
  proves: string[];
  doesNotProve: string[];
}

/**
 * The reach of this check, written down rather than implied.
 *
 * `76-ENGINE-PLAN` CHANGE 1: a check may not grade a rule whose subject lives beyond what it
 * can see. This one can see a file and a key. Everything a client might reasonably assume a
 * "signed receipt" means — that the audit was honest, that it ran against the code they were
 * shipped, that the signer is who they say they are — is outside that, and saying so is not a
 * disclaimer. It is the difference between evidence and a badge.
 */
export const DOES_NOT_PROVE = [
  'who holds the signing key — only that whoever does, signed this',
  'that the audit ran against the code you were shipped',
  'when it was signed: the timestamp is inside the signature, so it is only as honest as the signer',
];

export function checkDocument(raw: string, publicKeyPem: string): CheckReport {
  const empty = { digest: null, signedAt: null, covers: null, proves: [], doesNotProve: DOES_NOT_PROVE };
  const parsed = parseReceiptDocument(raw);

  if (parsed.kind === 'unreadable') {
    return { outcome: 'UNVERIFIABLE', signature: 'UNVERIFIABLE', reason: parsed.reason, ...empty };
  }
  if (parsed.kind === 'receipt') {
    return {
      outcome: 'UNVERIFIABLE',
      signature: 'UNVERIFIABLE',
      reason: 'This is a receipt, but nobody signed it. Its digest still proves it is internally consistent; it proves nothing about who produced it.',
      ...empty,
      covers: coversOf(parsed.receipt),
    };
  }

  const verdict = verifyAttestation(parsed.signed, publicKeyPem);
  const covers = coversOf(parsed.signed.receipt);
  const signedAt = typeof parsed.signed.attestation?.signedAt === 'string' ? parsed.signed.attestation.signedAt : null;

  if (!verdict.ok) {
    return {
      outcome: verdict.outcome,
      signature: verdict.outcome,
      reason: verdict.reason,
      digest: null,
      signedAt,
      covers,
      proves: [],
      doesNotProve: DOES_NOT_PROVE,
    };
  }

  // The signature is good. Now: is there anything under it?
  if (covers.rules === 0) {
    return {
      outcome: 'UNVERIFIABLE',
      signature: 'VALID',
      reason: 'The signature is good, but this receipt grades zero rules — there is nothing here for it to be evidence of.',
      digest: verdict.digest,
      signedAt,
      covers,
      proves: ['the file has not changed since it was signed'],
      doesNotProve: DOES_NOT_PROVE,
    };
  }

  return {
    outcome: 'VALID',
    signature: 'VALID',
    reason: verdict.reason,
    digest: verdict.digest,
    signedAt,
    covers,
    proves: [
      'the file has not changed by one character since it was signed',
      'it was signed by the holder of the private half of this key',
      `it grades ${covers.rules} rule${covers.rules === 1 ? '' : 's'}: ${covers.followed} followed, ${covers.violated} violated, ${covers.unverifiable} unverifiable`,
    ],
    doesNotProve: DOES_NOT_PROVE,
  };
}

export type SignResult = { ok: true; json: string; digest: string; covers: Covers } | { ok: false; reason: string };

/**
 * Sign a receipt file.
 *
 * Re-signing an already-signed receipt is allowed and simply replaces the attestation: the
 * digest is recomputed from the body either way, so the second signature covers exactly what
 * the first one did. Refusing it would only send people to a text editor.
 */
export function signDocument(raw: string, privateKeyPem: string, now = new Date()): SignResult {
  const parsed = parseReceiptDocument(raw);
  if (parsed.kind === 'unreadable') return { ok: false, reason: parsed.reason };

  const receipt = parsed.kind === 'signed' ? parsed.signed.receipt : parsed.receipt;
  if (!receipt || !Array.isArray(receipt.results)) {
    return { ok: false, reason: 'That signed document has no receipt inside it.' };
  }

  let signed: SignedReceipt;
  try {
    signed = attest(receipt, privateKeyPem, now);
  } catch (err) {
    return { ok: false, reason: `That private key could not be used to sign: ${err instanceof Error ? err.message : String(err)}` };
  }

  return {
    ok: true,
    // No second copy of the version at the top level: it already lives inside the
    // attestation block, and one idea in two places is INVARIANTS E-1 and twelve bugs.
    json: `${JSON.stringify(signed, null, 2)}\n`,
    digest: signed.attestation.digest,
    covers: coversOf(signed.receipt),
  };
}
