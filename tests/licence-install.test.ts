import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setLicence } from '../src/lib/licence-local';
import type { LicenceCheck } from '../src/lib/licence';

/**
 * Installing a licence, on any platform.
 *
 * The install page told every user, on every operating system:
 *
 *     mkdir -p ~/.enforcee && echo "<your licence>" > ~/.enforcee/licence
 *
 * That is bash. On Windows PowerShell `mkdir -p` errors, and `echo >` writes UTF-16 with a
 * BOM that the verifier cannot parse. So the FIRST STEP of the paid product was broken for
 * Windows users, and it failed looking like a bad licence rather than a bad instruction —
 * the user blames the thing they just paid for.
 *
 * Nothing caught it because nothing tested the instructions. These tests cover the tool
 * that replaces them.
 */

const GOOD: LicenceCheck = {
  ok: true,
  payload: { sub: 'p@example.com', plan: 'builder', exp: 4102444800, iat: 1, jti: 'x' },
} as unknown as LicenceCheck;

const BAD: LicenceCheck = { ok: false, reason: 'Signature does not match' } as unknown as LicenceCheck;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'enf-lic-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('enforcee licence set', () => {
  it('creates the directory it needs, rather than requiring mkdir -p', () => {
    // The nested path does not exist. This is the whole point: `mkdir -p` was a step the
    // user had to perform, in a shell that may not support it.
    const path = join(dir, 'nested', '.enforcee', 'licence');
    const res = setLicence('enf1.good', { path, verify: () => GOOD });
    expect(res.ok).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8').trim()).toBe('enf1.good');
  });

  it('REFUSES to write a licence that does not verify', () => {
    // The load-bearing one. A file that exists but does not verify is indistinguishable,
    // to every later run, from a licence that expired — so the user cannot tell whether
    // they pasted it wrong or their subscription lapsed. Never write an unverified one.
    const path = join(dir, 'licence');
    const res = setLicence('enf1.garbage', { path, verify: () => BAD });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('nothing was written');
    expect(existsSync(path), 'an unverified licence reached the disk').toBe(false);
  });

  it('does not clobber a working licence with a broken paste', () => {
    // The realistic version of the above: someone already licensed pastes a truncated key.
    // If the write happened first they would be locked out of a product they paid for.
    const path = join(dir, 'licence');
    writeFileSync(path, 'enf1.the-good-one\n');
    setLicence('enf1.truncated', { path, verify: () => BAD });
    expect(readFileSync(path, 'utf8').trim()).toBe('enf1.the-good-one');
  });

  it('survives what a shell actually hands you', () => {
    const path = join(dir, 'licence');
    for (const raw of [
      '  enf1.good  ', //   copied with whitespace
      '"enf1.good"', //     quoted by the user
      "'enf1.good'", //     quoted the other way
      '﻿enf1.good', //  UTF-8 BOM, which is what PowerShell's `echo >` produces
      'enf1.good\r\n', //   CRLF, which is what a Windows editor produces
    ]) {
      const res = setLicence(raw, { path, verify: () => GOOD });
      expect(res.ok, `rejected ${JSON.stringify(raw)}`).toBe(true);
      expect(readFileSync(path, 'utf8').trim(), `mangled ${JSON.stringify(raw)}`).toBe('enf1.good');
    }
  });

  it('rejects an empty licence without touching the disk', () => {
    const path = join(dir, 'licence');
    for (const empty of ['', '   ', '""']) {
      const res = setLicence(empty, { path, verify: () => GOOD });
      expect(res.ok).toBe(false);
      expect(existsSync(path)).toBe(false);
    }
  });

  it('writes a trailing newline, because findLicence trims and editors add one anyway', () => {
    const path = join(dir, 'licence');
    setLicence('enf1.good', { path, verify: () => GOOD });
    expect(readFileSync(path, 'utf8')).toBe('enf1.good\n');
  });
});

describe('the install instructions', () => {
  it('never tell a user to run a bash-only line', () => {
    // The instruction is the product surface here. It shipped broken on one platform for
    // the entire life of the paid tier, so it gets a test like anything else that ships.
    const surfaces = [
      'src/app/install/page.tsx',
      'cli/index.ts',
      'README.md',
      'scripts/pack-cli.mjs',
    ];
    const offenders: string[] = [];
    for (const f of surfaces) {
      const text = readFileSync(join(__dirname, '..', f), 'utf8');
      // `mkdir -p` paired with a licence path is the exact shape that broke.
      if (/mkdir -p[^\n]*\.enforcee/.test(text)) offenders.push(f);
      if (/echo\s+"?<[^\n]*>"?\s*>\s*[^\n]*licence/.test(text)) offenders.push(f);
    }
    expect(offenders, `bash-only licence install in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('point at the cross-platform command instead', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/install/page.tsx'), 'utf8');
    expect(page).toContain('enforcee licence set');
  });
});
