import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { Receipt } from './types';
import { digestOf } from './receipt';

/**
 * Signed receipts — the Founder promise, made true.
 *
 * The digest alone proves INTERNAL CONSISTENCY: this body produces this hash. It proves
 * nothing about origin. Anyone can author a receipt saying whatever they like and compute a
 * perfectly valid digest for it, which is fine while a receipt is something you read yourself
 * and becomes a lie the moment it is handed to a third party as evidence.
 *
 * Founder sells "signed receipts you can hand to a client". A client checking a hash learns
 * only that the file has not been corrupted — not that Enforcee produced it. This closes that
 * gap with an Ed25519 signature over the digest, verifiable by anyone holding the public key
 * and forgeable by nobody without the private half.
 *
 * Deliberately signs the DIGEST rather than the body. The digest is already a canonical
 * ordering of the receipt, so the signature inherits that determinism, and a verifier must
 * recompute the digest to check the signature — which means a tampered body fails twice, once
 * on the hash and once on the signature. A signature over a body with unstable key ordering
 * would pass or fail depending on how the JSON was serialised, which is not a property to
 * hand a client.
 */

export const ATTESTATION_VERSION = 'attestation@1.0.0';

export interface Attestation {
  version: string;
  /** The digest that was signed. Recomputed by the verifier; never trusted as given. */
  digest: string;
  /** base64url Ed25519 signature over the digest string. */
  signature: string;
  /** ISO timestamp of signing. Advisory only — it is inside the signature, not a proof of time. */
  signedAt: string;
}

export interface SignedReceipt {
  receipt: Receipt;
  attestation: Attestation;
}

export function attest(receipt: Receipt, privateKeyPem: string, now = new Date()): SignedReceipt {
  const { digest: _ignored, ...body } = receipt;
  // Recomputed rather than taken from the receipt, so a receipt arriving with a wrong digest
  // cannot have that wrong digest signed into legitimacy.
  const digest = digestOf(body as Omit<Receipt, 'digest'>);
  const key = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));
  const signature = sign(null, Buffer.from(digest, 'utf8'), key).toString('base64url');

  return {
    receipt: { ...body, digest } as Receipt,
    attestation: { version: ATTESTATION_VERSION, digest, signature, signedAt: now.toISOString() },
  };
}

export type AttestationVerdict =
  | { ok: true; digest: string }
  | { ok: false; reason: string };

/**
 * Check a signed receipt. Anyone can run this with the public key — that is the point.
 *
 * Three independent ways to fail, kept separate because they mean different things to whoever
 * is holding the receipt: the body was altered, the signature is not ours, or the file is
 * malformed. Collapsing them into "invalid" would tell a client nothing about what happened.
 */
export function verifyAttestation(signed: SignedReceipt, publicKeyPem: string): AttestationVerdict {
  const { receipt, attestation } = signed ?? ({} as SignedReceipt);
  if (!receipt || !attestation?.signature || !attestation?.digest) {
    return { ok: false, reason: 'Not a signed receipt — no attestation block.' };
  }

  const { digest: claimed, ...body } = receipt;
  const recomputed = digestOf(body as Omit<Receipt, 'digest'>);

  if (recomputed !== claimed) {
    return { ok: false, reason: 'The receipt body does not match its own digest — it has been altered since it was written.' };
  }
  if (recomputed !== attestation.digest) {
    return { ok: false, reason: 'The signature covers a different receipt than the one attached to it.' };
  }

  try {
    const key = createPublicKey(publicKeyPem.replace(/\\n/g, '\n'));
    const ok = verify(null, Buffer.from(recomputed, 'utf8'), key, Buffer.from(attestation.signature, 'base64url'));
    return ok
      ? { ok: true, digest: recomputed }
      : { ok: false, reason: 'The digest is intact but the signature was not made by this key — this receipt did not come from Enforcee.' };
  } catch (err) {
    return { ok: false, reason: `Could not check the signature: ${err instanceof Error ? err.message : String(err)}` };
  }
}
