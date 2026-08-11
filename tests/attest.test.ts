import { describe, it, expect } from 'vitest';
import { generateLicenceKeypair } from '../src/lib/licence';
import { attest, verifyAttestation } from '../src/lib/attest';
import { sealReceipt } from '../src/lib/receipt';
import type { Receipt } from '../src/lib/types';

/**
 * Founder sells "signed receipts you can hand to a client". Until now the receipt carried
 * only a sha256 digest, which proves internal consistency and nothing about origin — anyone
 * could author a receipt saying whatever they liked and compute a perfectly valid digest.
 *
 * Fine while a receipt is something you read yourself. A lie the moment it is handed to a
 * third party as evidence. These tests are written from that third party's point of view:
 * what can someone holding this receipt actually conclude?
 */
const { publicKey, privateKey } = generateLicenceKeypair();
const other = generateLicenceKeypair();

const receipt = (): Receipt =>
  sealReceipt({
    version: 'receipt@1.0.0',
    engine: { deterministic: 'x', judge: null },
    summary: { total: 2, followed: 1, violated: 1, notApplicable: 0, unverifiable: 0, coverage: 1 },
    results: [{ ruleId: 'a', verdict: 'VIOLATED', method: 'deterministic', evidence: [], rationale: 'r', engaged: true }],
    health: [],
    rulesetHash: 'h', outputHash: 'o', previousDigest: null, createdAt: '2026-08-11T00:00:00.000Z',
  } as unknown as Omit<Receipt, 'digest'>);

describe('a client can check a receipt came from us', () => {
  it('verifies a genuine signed receipt', () => {
    const signed = attest(receipt(), privateKey);
    expect(verifyAttestation(signed, publicKey)).toMatchObject({ ok: true });
  });

  it('REFUSES a receipt whose body was edited after signing', () => {
    // The most likely real attack: take a real receipt, change a VIOLATED to FOLLOWED, and
    // hand it to a client as proof the rules held.
    const signed = attest(receipt(), privateKey);
    signed.receipt.results[0].verdict = 'FOLLOWED';
    const v = verifyAttestation(signed, publicKey);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/altered since it was written/);
  });

  it('REFUSES a receipt signed by somebody else — the whole point', () => {
    // Before this existed, anyone could author a receipt and compute a valid digest for it.
    const forged = attest(receipt(), other.privateKey);
    const v = verifyAttestation(forged, publicKey);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/did not come from Enforcee/);
  });

  it('REFUSES a signature lifted from a different receipt', () => {
    const a = attest(receipt(), privateKey);
    const b = attest({ ...receipt(), outputHash: 'different' } as Receipt, privateKey);
    const frankenstein = { receipt: a.receipt, attestation: b.attestation };
    const v = verifyAttestation(frankenstein, publicKey);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/covers a different receipt/);
  });

  it('says plainly when the thing is not a signed receipt at all', () => {
    const v = verifyAttestation({ receipt: receipt() } as never, publicKey);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/no attestation block/);
  });

  it('does not sign a wrong digest into legitimacy', () => {
    // A receipt arriving with a digest that does not match its body must not have that wrong
    // digest signed — the signer recomputes rather than trusting what it was handed.
    const r = receipt();
    r.digest = 'deadbeef';
    const signed = attest(r, privateKey);
    expect(signed.attestation.digest).not.toBe('deadbeef');
    expect(verifyAttestation(signed, publicKey)).toMatchObject({ ok: true });
  });

  it('the three failure modes stay distinguishable', () => {
    // A client needs to know WHICH went wrong: altered, forged, or malformed. Collapsing
    // them into "invalid" tells them nothing about what they are holding.
    const edited = attest(receipt(), privateKey);
    edited.receipt.summary.violated = 99;
    const forged = attest(receipt(), other.privateKey);

    const reasons = [
      verifyAttestation(edited, publicKey),
      verifyAttestation(forged, publicKey),
      verifyAttestation({} as never, publicKey),
    ].map((v) => (v.ok ? 'ok' : v.reason));

    expect(new Set(reasons).size).toBe(3);
  });
});
