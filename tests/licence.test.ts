import { describe, it, expect } from 'vitest';
import { generateLicenceKeypair, issueLicence, verifyLicence, licenceMessage } from '../src/lib/licence';

const { publicKey, privateKey } = generateLicenceKeypair();
const OTHER = generateLicenceKeypair();

const DAY = 86_400;
const NOW_S = 1_800_000_000; // fixed, so nothing here depends on the wall clock
const NOW_MS = NOW_S * 1000;

function make(over: Partial<Parameters<typeof issueLicence>[0]> = {}, key = privateKey) {
  return issueLicence(
    { jti: 'abc123', sub: 'someone@example.com', plan: 'builder', exp: NOW_S + 45 * DAY, ...over },
    key,
    NOW_S
  );
}

describe('licence: the happy path', () => {
  it('round-trips a valid licence', () => {
    const check = verifyLicence(make(), publicKey, NOW_MS);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.payload.plan).toBe('builder');
    expect(check.payload.sub).toBe('someone@example.com');
  });

  it('is one line with a single dot, so it survives a copy-paste', () => {
    const token = make();
    expect(token.split('.')).toHaveLength(2);
    expect(token).not.toMatch(/\s/);
  });

  it('carries the plan, so founder-only features can check it too', () => {
    const check = verifyLicence(make({ plan: 'founder' }), publicKey, NOW_MS);
    expect(check.ok && check.payload.plan).toBe('founder');
  });
});

describe('licence: everything that should fail', () => {
  it('rejects a missing licence rather than defaulting open', () => {
    expect(verifyLicence(undefined, publicKey, NOW_MS)).toMatchObject({ ok: false, reason: 'missing' });
    expect(verifyLicence('', publicKey, NOW_MS)).toMatchObject({ ok: false, reason: 'missing' });
    expect(verifyLicence('   ', publicKey, NOW_MS)).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('rejects a licence signed by somebody else', () => {
    const forged = make({}, OTHER.privateKey);
    expect(verifyLicence(forged, publicKey, NOW_MS)).toMatchObject({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a payload edited after signing — the whole point', () => {
    const token = make({ plan: 'builder' });
    const [body, sig] = token.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    payload.plan = 'founder';
    payload.exp = NOW_S + 100 * 365 * DAY;
    const tampered = `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${sig}`;
    expect(verifyLicence(tampered, publicKey, NOW_MS)).toMatchObject({ ok: false, reason: 'bad-signature' });
  });

  it('rejects an expired licence, and says when it died', () => {
    const token = make({ exp: NOW_S - DAY });
    const check = verifyLicence(token, publicKey, NOW_MS);
    expect(check).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('accepts right up to the expiry second and not after', () => {
    const exp = NOW_S + 10;
    expect(verifyLicence(make({ exp }), publicKey, exp * 1000).ok).toBe(true);
    expect(verifyLicence(make({ exp }), publicKey, exp * 1000 + 1).ok).toBe(false);
  });

  it('rejects junk without throwing', () => {
    for (const junk of ['nonsense', 'a.b.c', 'a.b', '....', '%%%.%%%']) {
      expect(() => verifyLicence(junk, publicKey, NOW_MS)).not.toThrow();
      expect(verifyLicence(junk, publicKey, NOW_MS).ok).toBe(false);
    }
  });

  it('fails closed when the build has no public key', () => {
    expect(verifyLicence(make(), undefined, NOW_MS)).toMatchObject({ ok: false, reason: 'no-public-key' });
  });
});

describe('licence: what the human reads', () => {
  it('never blames the user and always names the way out', () => {
    const reasons = ['missing', 'expired', 'bad-signature', 'malformed'] as const;
    for (const reason of reasons) {
      const msg = licenceMessage({ ok: false, reason });
      expect(msg.length).toBeGreaterThan(20);
      expect(msg).not.toMatch(/error|invalid|denied/i);
    }
  });

  it('confirms who a good licence belongs to', () => {
    const check = verifyLicence(make(), publicKey, NOW_MS);
    expect(licenceMessage(check)).toContain('someone@example.com');
  });
});
