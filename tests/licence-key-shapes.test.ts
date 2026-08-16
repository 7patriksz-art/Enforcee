import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { issueLicence, verifyLicence, toPrivateKeyPem } from '../src/lib/licence';

/**
 * The private key does not always arrive as PEM, and for a year ours has not.
 *
 * `ENFORCEE_LICENCE_PRIVATE_KEY` in this project's Vercel environment holds **bare base64 DER**
 * — `MC4CAQAwBQYDK2Vw…`, the PKCS#8 body without the `-----BEGIN PRIVATE KEY-----` lines. That
 * is a sensible thing to have done: a PEM is multi-line, and stripping the armour is the
 * simplest way to make it survive an environment variable.
 *
 * `createPrivateKey` on a plain string requires the armour, so it threw `ERR_OSSL_UNSUPPORTED`
 * — meaning `POST /api/licence` returned a 500 to every subscriber who asked for a licence.
 * Nobody had hit it yet only because nobody has yet bought the paid tier.
 *
 * Found on 2026-08-16 by Patrik, on his own machine, following docs/SETUP-ENFORCEMENT.md.
 * **CI could not have found this and never will**: there is no key on a runner, so every test
 * that touches signing generates its own and generated keys are always PEM. The only way to
 * see it was to use the real one.
 *
 * These cases pin the shapes we accept. The last two are the controls: a licence must still be
 * REJECTED when it should be, or "we accept more shapes" would quietly mean "we accept
 * anything".
 */

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

/** The armour stripped — exactly what is in Vercel today. */
const BARE = PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
/** How a dashboard or .env file often mangles a PEM. */
const ESCAPED = PEM.trim().replace(/\n/g, '\\n');
const QUOTED = `"${PEM.trim()}"`;
const CRLF = PEM.replace(/\n/g, '\r\n');

const payload = { jti: 'shapes', sub: 'tests@enforcee', plan: 'founder' as const, exp: Math.floor(Date.now() / 1000) + 3600 };

describe('the key shape that is actually in production', () => {
  it('bare base64 DER is not usable by createPrivateKey on its own — this is the bug', () => {
    // The reason this file exists, asserted rather than described.
    expect(() => createPrivateKey(BARE)).toThrow();
  });

  it('and issueLicence signs with it anyway, because it normalises first', () => {
    const token = issueLicence(payload, BARE);
    expect(verifyLicence(token, PUB).ok, 'a licence signed from the bare DER key must verify').toBe(true);
  });

  it('produces a key identical to the PEM it came from', () => {
    // Not "it works" — the same key. A normaliser that quietly produced a *different* usable
    // key would sign licences no client could verify.
    expect(toPrivateKeyPem(BARE).replace(/\s+/g, '')).toBe(PEM.replace(/\s+/g, ''));
  });
});

describe('every other shape a key arrives in', () => {
  for (const [name, value] of [
    ['PEM as generated', PEM],
    ['PEM with literal \\n instead of newlines', ESCAPED],
    ['PEM wrapped in quotes', QUOTED],
    ['PEM with CRLF line endings', CRLF],
    ['bare base64 DER', BARE],
    ['bare base64 DER with newlines in it', BARE.match(/.{1,64}/g)!.join('\n')],
  ] as Array<[string, string]>) {
    it(`${name}: signs, and the licence verifies`, () => {
      const token = issueLicence(payload, value);
      const check = verifyLicence(token, PUB);
      expect(check.ok, `${name} did not produce a verifying licence`).toBe(true);
      if (check.ok) expect(check.payload.sub).toBe('tests@enforcee');
    });
  }
});

describe('controls — accepting more shapes must not mean accepting anything', () => {
  it('a key that is not a key still fails, rather than being wrapped into nonsense', () => {
    expect(() => issueLicence(payload, 'this is not a key at all')).toThrow();
  });

  it('an empty value fails', () => {
    expect(() => issueLicence(payload, '   ')).toThrow();
  });

  it('a truncated DER body fails — it is valid base64 and still not a key', () => {
    expect(() => issueLicence(payload, BARE.slice(0, 32))).toThrow();
  });

  it("a DIFFERENT key's licence is still rejected by the public key", () => {
    const other = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = issueLicence(payload, other);
    expect(verifyLicence(token, PUB).ok, 'a licence from the wrong key must not verify').toBe(false);
  });
});
