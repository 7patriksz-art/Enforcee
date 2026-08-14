import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

/**
 * Offline licences.
 *
 * The guard is the paid product, and it runs on a laptop that we deliberately never talk
 * to. Those two facts fight unless the licence can be checked without a network call —
 * so it is an Ed25519-signed token that the CLI verifies against a public key compiled
 * into it. No phone-home, no telemetry, no "activation server" that breaks on a plane.
 *
 * What this buys us, honestly stated: it stops casual use of a paid feature. It does not
 * stop a determined person patching the binary, and we are not going to pretend otherwise
 * or spend the product's life fighting that. The people who would patch it were never
 * going to pay; the people who would pay want a licence file that works on a plane.
 *
 * Token format: base64url(payload).base64url(signature)  — one line, copy-pasteable.
 */

export interface LicencePayload {
  /** Licence id, so one can be revoked in a future release without touching the rest. */
  jti: string;
  /** Who it belongs to. Shown by the CLI so a shared key is visibly somebody's name. */
  sub: string;
  plan: 'builder' | 'founder';
  /** Issued at / expires at, seconds since epoch. */
  iat: number;
  exp: number;
  /** Bumped if the format ever changes. */
  v: 1;
}

export type LicenceCheck =
  | { ok: true; payload: LicencePayload }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'expired' | 'no-public-key'; detail?: string };

const b64url = {
  encode: (b: Buffer) => b.toString('base64url'),
  decode: (s: string) => Buffer.from(s, 'base64url'),
};

/** Sign a licence. Server-side only — the private key never leaves the environment. */
export function issueLicence(
  payload: Omit<LicencePayload, 'iat' | 'v'>,
  privateKeyPem: string,
  issuedAt = Math.floor(Date.now() / 1000)
): string {
  const full: LicencePayload = { ...payload, iat: issuedAt, v: 1 };
  const body = b64url.encode(Buffer.from(JSON.stringify(full), 'utf8'));
  const sig = sign(null, Buffer.from(body, 'utf8'), createPrivateKey(privateKeyPem));
  return `${body}.${b64url.encode(sig)}`;
}

/**
 * Verify a licence against a public key. Runs anywhere, offline, in about a millisecond.
 *
 * `now` is injectable so the tests do not have to wait a year to check expiry.
 */
export function verifyLicence(token: string | undefined | null, publicKeyPem: string | undefined, now = Date.now()): LicenceCheck {
  if (!token || !token.trim()) return { ok: false, reason: 'missing' };
  if (!publicKeyPem) return { ok: false, reason: 'no-public-key' };

  const parts = token.trim().split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;

  let payload: LicencePayload;
  try {
    payload = JSON.parse(b64url.decode(body).toString('utf8')) as LicencePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload?.v !== 1 || !payload.plan || !payload.exp) return { ok: false, reason: 'malformed' };

  let good = false;
  try {
    good = verify(null, Buffer.from(body, 'utf8'), createPublicKey(publicKeyPem), b64url.decode(sig));
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
  if (!good) return { ok: false, reason: 'bad-signature' };

  if (payload.exp * 1000 < now) {
    return { ok: false, reason: 'expired', detail: new Date(payload.exp * 1000).toISOString().slice(0, 10) };
  }

  return { ok: true, payload };
}

/** One-off, run by hand, output stored in the environment. Never called at runtime. */
export function generateLicenceKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

/** Human-readable reason, written for the person who just hit the wall. */
export function licenceMessage(check: LicenceCheck): string {
  if (check.ok) return `Licensed to ${check.payload.sub} · ${check.payload.plan}`;
  switch (check.reason) {
    case 'missing':
      return 'No licence found. The guard is part of Builder — enforcee.com/pricing. Auditing stays free.';
    case 'expired':
      return `Licence expired${check.detail ? ` on ${check.detail}` : ''}. Renew at enforcee.com/pricing.`;
    case 'bad-signature':
      return 'That licence did not verify. Copy it again from your account page.';
    case 'malformed':
      return 'That licence is not a licence. Copy the whole line, including the dot.';
    case 'no-public-key':
      return 'This build has no verification key compiled in, so it cannot check licences.';
  }
}
