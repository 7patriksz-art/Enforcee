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

export type AttestationOutcome = 'VALID' | 'REFUTED' | 'UNVERIFIABLE';

export type AttestationVerdict =
  | { ok: true; outcome: 'VALID'; digest: string; reason: string }
  | { ok: false; outcome: 'REFUTED'; reason: string }
  | { ok: false; outcome: 'UNVERIFIABLE'; reason: string };

/** Ed25519 signatures are exactly 64 bytes. Anything else is a malformed file, not a forgery. */
const ED25519_SIGNATURE_BYTES = 64;

/**
 * Check a signed receipt. Anyone can run this with the public key — that is the point.
 *
 * THREE OUTCOMES, NOT TWO, and the third is the one that matters.
 *
 * The first cut of this returned `{ ok: false }` for everything that was not a good
 * signature, which put four very different situations in one bucket: the body was altered,
 * the signature is somebody else's, the receipt was never signed at all, and *we could not
 * tell*. The first two are accusations. The last two are not, and printing an accusation for
 * them is a false accusation of forgery against a document that may be perfectly honest —
 * the exact defect class this project has now recorded eleven times, aimed this time at a
 * third party who has no way to check our work.
 *
 * So: REFUTED means we checked and it failed. UNVERIFIABLE means we could not check.
 * `INVARIANTS.md` H-3 — `UNVERIFIABLE` is a valid outcome and must remain reachable.
 *
 * What a VALID answer proves, stated exactly: this receipt has not changed by one character
 * since it was signed, and it was signed by whoever holds the private half of the key you
 * supplied. It does NOT prove who that person is, when it was signed (the timestamp is
 * inside the signature, so it is only as honest as the signer), or that the audit inside was
 * run against the code you were shipped. Those live beyond what this check can see.
 */
export function verifyAttestation(signed: SignedReceipt, publicKeyPem: string): AttestationVerdict {
  const { receipt, attestation } = signed ?? ({} as SignedReceipt);
  if (!receipt || !attestation?.signature || !attestation?.digest) {
    return {
      ok: false,
      outcome: 'UNVERIFIABLE',
      reason: 'Not a signed receipt — no attestation block. An unsigned receipt is not a forged one; there is simply nothing here to check.',
    };
  }
  if (typeof publicKeyPem !== 'string' || !publicKeyPem.trim()) {
    return { ok: false, outcome: 'UNVERIFIABLE', reason: 'No public key was supplied, so there is nothing to check the signature against.' };
  }

  const { digest: claimed, ...body } = receipt;
  const recomputed = digestOf(body as Omit<Receipt, 'digest'>);

  if (recomputed !== claimed) {
    return { ok: false, outcome: 'REFUTED', reason: 'The receipt body does not match its own digest — it has been altered since it was written.' };
  }
  if (recomputed !== attestation.digest) {
    return { ok: false, outcome: 'REFUTED', reason: 'The signature covers a different receipt than the one attached to it.' };
  }

  // A signature of the wrong length was never produced by Ed25519, so it is a damaged or
  // hand-edited file rather than a forgery attempt we caught. base64url decoding never
  // throws — it silently drops what it cannot read — so length is the only place this shows.
  const sigBytes = Buffer.from(attestation.signature, 'base64url');
  if (sigBytes.length !== ED25519_SIGNATURE_BYTES) {
    return {
      ok: false,
      outcome: 'UNVERIFIABLE',
      reason: `The attestation's signature is ${sigBytes.length} bytes, not the ${ED25519_SIGNATURE_BYTES} an Ed25519 signature has — the file is damaged, so it can be neither confirmed nor refuted.`,
    };
  }

  let key;
  try {
    key = createPublicKey(publicKeyPem.replace(/\\n/g, '\n'));
  } catch (err) {
    return {
      ok: false,
      outcome: 'UNVERIFIABLE',
      reason: `That public key could not be read, so nothing could be checked: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // A key of the WRONG TYPE is not a failed check, and finding that out cost a smoke test.
  //
  // `verify(null, …)` with an RSA public key does not throw — it returns `false`, exactly as
  // it does for a real forgery. So a client who was handed the right receipt and reached for
  // the wrong key file was told, in red, that the receipt "was not signed by this key", which
  // is the false accusation this whole three-state design exists to prevent, aimed at the one
  // person in the transaction with no way to check our work.
  //
  // Asked of the key rather than inferred from the answer: charter honesty rule 8, measure the
  // artefact and not the intent.
  if (key.asymmetricKeyType !== 'ed25519') {
    return {
      ok: false,
      outcome: 'UNVERIFIABLE',
      reason: `That key is ${key.asymmetricKeyType ?? 'of an unknown type'}, not Ed25519, so it cannot check this signature either way. You are probably holding the wrong key file.`,
    };
  }

  try {
    const ok = verify(null, Buffer.from(recomputed, 'utf8'), key, sigBytes);
    return ok
      ? {
          ok: true,
          outcome: 'VALID',
          digest: recomputed,
          reason: 'The receipt has not changed since it was signed, and the signature was made by the holder of this key.',
        }
      : {
          ok: false,
          outcome: 'REFUTED',
          // Deliberately NOT "this did not come from Enforcee". The signing key belongs to
          // whoever ran `enforcee sign`, not to us — we hold no private key a laptop could
          // reach — so naming ourselves here would tell a client something we cannot know.
          reason: 'The digest is intact but the signature was not made by this key — either it was signed by somebody else, or you are holding the wrong key.',
        };
  } catch (err) {
    // A structurally valid key of the wrong TYPE — RSA, EC, an X25519 agreement key — lands
    // here. We could not check; that is not the same as failing the check.
    return {
      ok: false,
      outcome: 'UNVERIFIABLE',
      reason: `Could not check the signature with this key: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
