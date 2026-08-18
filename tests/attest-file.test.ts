import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { generateLicenceKeypair } from '@/lib/licence';
import { sealReceipt } from '@/lib/receipt';
import {
  ATTESTATION_KEY_PATHS,
  DOES_NOT_PROVE,
  checkDocument,
  coversOf,
  generateAttestationKeypair,
  parseReceiptDocument,
  signDocument,
} from '@/lib/attest-file';
import type { Receipt, RuleResult } from '@/lib/types';

/**
 * THE CLIENT'S POINT OF VIEW.
 *
 * `tests/attest.test.ts` checks the crypto. This checks the thing a person actually holds: a
 * JSON file and a key, handed over by a supplier, opened by someone who has never heard of
 * this product and has no reason to trust it.
 *
 * Every case below is written as a question that person would ask, because the failure this
 * feature is repairing was not a bug in the crypto — the crypto was correct and green for
 * seven days while `enforcee.com/pricing` sold *"Signed receipts you can hand to a client"*
 * and nothing in the product could sign. The gap was that no surface existed.
 */

const { publicKey, privateKey } = generateLicenceKeypair();
const other = generateLicenceKeypair();

function result(id: string, verdict: RuleResult['verdict']): RuleResult {
  return { ruleId: id, verdict, method: 'deterministic', evidence: [], rationale: 'r', engaged: true };
}

function receipt(results: RuleResult[] = [result('a', 'FOLLOWED'), result('b', 'VIOLATED')]): Receipt {
  return sealReceipt({
    version: '1',
    engine: { parser: 'p', deterministic: 'x', judge: null },
    summary: { total: results.length, followed: 1, violated: 1, notApplicable: 0, unverifiable: 0, coverage: 1, deterministicShare: 1 },
    results,
    rules: [],
    health: [],
    cost: [],
    rulesetHash: 'h',
    outputHash: 'o',
    previousDigest: null,
    createdAt: '2026-08-18T00:00:00.000Z',
  } as unknown as Omit<Receipt, 'digest'>) as Receipt;
}

const sign = (r: Receipt = receipt(), key = privateKey) => {
  const s = signDocument(JSON.stringify(r), key);
  if (!s.ok) throw new Error(`fixture failed to sign: ${s.reason}`);
  return s.json;
};

describe('a stranger holding a receipt and a key gets a straight answer', () => {
  it('VALID for a genuine signed receipt', () => {
    const report = checkDocument(sign(), publicKey);
    expect(report.outcome).toBe('VALID');
    expect(report.signature).toBe('VALID');
    expect(report.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('REFUTED when one character of the body was changed', () => {
    // The whole attack: take a real receipt, turn a VIOLATED into a FOLLOWED, hand it over.
    const doc = JSON.parse(sign());
    doc.receipt.results[1].verdict = 'FOLLOWED';
    const report = checkDocument(JSON.stringify(doc), publicKey);
    expect(report.outcome).toBe('REFUTED');
    expect(report.reason).toMatch(/altered since it was written/);
  });

  it('REFUTED when it was signed by somebody else', () => {
    expect(checkDocument(sign(receipt(), other.privateKey), publicKey).outcome).toBe('REFUTED');
  });

  it('and the refusal never names us as the signer, because we are not', () => {
    // We hold no private key a laptop can reach. The key belongs to whoever ran `sign`, so
    // "this did not come from Enforcee" would be a claim we cannot support — and the earlier
    // wording said exactly that.
    const report = checkDocument(sign(receipt(), other.privateKey), publicKey);
    expect(report.reason).not.toMatch(/from Enforcee/i);
    expect(report.reason).toMatch(/wrong key|signed by somebody else/i);
  });
});

/**
 * `INVARIANTS.md` H-3: UNVERIFIABLE is a valid outcome and must remain reachable.
 *
 * These four are the reason the outcome is three-valued. Every one of them was, in the first
 * cut, reported as a failure — which tells a client the supplier's receipt is bad when the
 * truth is that the client is holding it wrong. A false accusation aimed at the one party
 * with no way to check our work is the worst output this command can produce.
 */
describe('UNVERIFIABLE is reachable, and it is not the same as REFUTED', () => {
  it('an unsigned receipt is unverifiable, not forged', () => {
    const report = checkDocument(JSON.stringify(receipt()), publicKey);
    expect(report.outcome).toBe('UNVERIFIABLE');
    expect(report.reason).toMatch(/nobody signed it/);
  });

  it('a key of the wrong TYPE is unverifiable — node returns false for RSA rather than throwing', () => {
    // Found by smoke-testing the built CLI, not by reasoning: `verify(null, …)` with an RSA
    // key returns false, indistinguishable from a forgery, so the type must be asked for.
    const { publicKey: rsa } = generateAttestationKeypairRsa();
    const report = checkDocument(sign(), rsa);
    expect(report.outcome).toBe('UNVERIFIABLE');
    expect(report.reason).toMatch(/not Ed25519/);
  });

  it('an unreadable key is unverifiable', () => {
    const report = checkDocument(sign(), 'this is not a key');
    expect(report.outcome).toBe('UNVERIFIABLE');
    expect(report.reason).toMatch(/could not be read/);
  });

  it('a damaged signature is unverifiable, because base64url decoding never complains', () => {
    const doc = JSON.parse(sign());
    doc.attestation.signature = 'AAAA';
    const report = checkDocument(JSON.stringify(doc), publicKey);
    expect(report.outcome).toBe('UNVERIFIABLE');
    expect(report.reason).toMatch(/not the 64 an Ed25519 signature has/);
  });

  it('a file that is not JSON, and JSON that is not a receipt, each say which', () => {
    expect(checkDocument('not json at all', publicKey).reason).toMatch(/not JSON/);
    expect(checkDocument('{"hello":1}', publicKey).reason).toMatch(/not an Enforcee receipt/);
  });

  it('but a real forgery is still REFUTED — this is not a checker that shrugs at everything', () => {
    // The control on the four above. Without it they are satisfied by returning UNVERIFIABLE
    // unconditionally, which would pass every test here and make the command worthless.
    expect(checkDocument(sign(receipt(), other.privateKey), publicKey).outcome).toBe('REFUTED');
  });
});

/**
 * `INVARIANTS.md` E-3 and CHANGE 2: every check reports its denominator, and zero scanned is
 * never a pass. A signature over a receipt that grades nothing is cryptographically perfect
 * and evidentially empty.
 */
describe('the check reports what it covers, and refuses to call nothing a pass', () => {
  it('counts the verdicts the signature actually covers', () => {
    const report = checkDocument(sign(receipt([result('a', 'FOLLOWED'), result('b', 'VIOLATED'), result('c', 'UNVERIFIABLE')])), publicKey);
    expect(report.covers).toEqual({ rules: 3, followed: 1, violated: 1, unverifiable: 1, notApplicable: 0 });
  });

  it('a perfectly signed receipt covering ZERO rules is UNVERIFIABLE, not VALID', () => {
    const report = checkDocument(sign(receipt([])), publicKey);
    expect(report.signature, 'the signature itself is fine and should say so').toBe('VALID');
    expect(report.outcome, 'an empty receipt was reported as good evidence').toBe('UNVERIFIABLE');
    expect(report.reason).toMatch(/zero rules/);
  });

  it('states its reach every time — including on a failure', () => {
    // CHANGE 1: a check may not grade what lives beyond what it can see. This one sees a file
    // and a key, and a client will otherwise fill in the rest themselves.
    for (const doc of [sign(), sign(receipt(), other.privateKey), '{"hello":1}']) {
      expect(checkDocument(doc, publicKey).doesNotProve).toEqual(DOES_NOT_PROVE);
    }
    expect(DOES_NOT_PROVE.join(' ')).toMatch(/ran against the code you were shipped/);
  });

  it('claims nothing is proved when nothing was verified', () => {
    expect(checkDocument(sign(receipt(), other.privateKey), publicKey).proves).toEqual([]);
    expect(checkDocument(sign(), publicKey).proves.length).toBeGreaterThan(0);
  });
});

describe('signing', () => {
  it('round-trips: what sign writes, check accepts', () => {
    expect(checkDocument(sign(), publicKey).outcome).toBe('VALID');
  });

  it('re-signing an already signed receipt replaces the attestation and still verifies', () => {
    const once = sign();
    const twice = signDocument(once, privateKey);
    expect(twice.ok).toBe(true);
    if (twice.ok) expect(checkDocument(twice.json, publicKey).outcome).toBe('VALID');
  });

  it('refuses a private key it cannot use, rather than writing an unusable file', () => {
    const r = signDocument(JSON.stringify(receipt()), 'not a key');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/could not be used to sign/);
  });

  it('refuses to sign something that is not a receipt', () => {
    expect(signDocument('{"hello":1}', privateKey).ok).toBe(false);
    expect(signDocument('nonsense', privateKey).ok).toBe(false);
  });

  it('reports the denominator at signing time too, so a signer sees an empty receipt', () => {
    const r = signDocument(JSON.stringify(receipt([])), privateKey);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.covers.rules).toBe(0);
  });

  it('does not sign a wrong digest into legitimacy', () => {
    const r = receipt();
    r.digest = 'deadbeef';
    const signed = signDocument(JSON.stringify(r), privateKey);
    expect(signed.ok).toBe(true);
    if (signed.ok) {
      expect(signed.digest).not.toBe('deadbeef');
      expect(checkDocument(signed.json, publicKey).outcome).toBe('VALID');
    }
  });
});

describe('parsing tells the three cases apart', () => {
  it('signed, unsigned and unreadable', () => {
    expect(parseReceiptDocument(sign()).kind).toBe('signed');
    expect(parseReceiptDocument(JSON.stringify(receipt())).kind).toBe('receipt');
    expect(parseReceiptDocument('[]').kind).toBe('unreadable');
    expect(parseReceiptDocument('').kind).toBe('unreadable');
  });

  it('never throws, whatever it is handed', () => {
    for (const junk of ['', '{', 'null', '[]', '"a string"', '{"attestation":1}', ' ']) {
      expect(() => parseReceiptDocument(junk)).not.toThrow();
      expect(() => checkDocument(junk, publicKey)).not.toThrow();
    }
  });

  it('coversOf survives a receipt with no results array', () => {
    expect(coversOf({} as Receipt).rules).toBe(0);
  });
});

describe('the key on disk', () => {
  it('generates a usable Ed25519 pair', () => {
    const pair = generateAttestationKeypair();
    expect(pair.privateKey).toMatch(/BEGIN PRIVATE KEY/);
    expect(pair.publicKey).toMatch(/BEGIN PUBLIC KEY/);
    expect(checkDocument(sign(receipt(), pair.privateKey), pair.publicKey).outcome).toBe('VALID');
  });

  it('builds its paths without a literal separator', () => {
    // INVARIANTS E-2. Five separator bugs on this project, every one caught only by Windows.
    const source = readSource('src/lib/attest-file.ts');
    expect(source, 'a path was built with a "/" literal instead of join()').not.toMatch(/'\.enforcee\//);
    expect(ATTESTATION_KEY_PATHS.privateKey).toContain('.enforcee');
    expect(ATTESTATION_KEY_PATHS.publicKey.endsWith('.pub')).toBe(true);
  });
});

function readSource(rel: string): string {
  return readFileSync(join(process.cwd(), ...rel.split('/')), 'utf8');
}

function generateAttestationKeypairRsa(): { publicKey: string } {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}
