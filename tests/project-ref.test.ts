import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { harvest } from './helpers/spawn';

/**
 * The project ref must resolve in an environment that has nothing.
 *
 * The first run of the email-templates workflow failed with `No project ref`. The script
 * resolved it from an argument, `$NEXT_PUBLIC_SUPABASE_URL`, or `.env.local` — three things
 * that exist on a dev machine and on no CI runner, because `.env.local` is gitignored
 * (correctly: it holds the service-role key).
 *
 * Third instance in one day of the same defect. The pixel audit hardcoded
 * `/opt/pw-browsers/chromium-1194/…`, the browser path of the one machine it ran on. The
 * email logo pointed at `enforcee.com/email-logo.png`, an asset committed in the same commit
 * as the template, so the URL 404'd for the only person who opened it. Each was fixed as an
 * instance. The class — WORKS ONLY WHERE IT WAS WRITTEN — kept coming back.
 *
 * So this test does not check that a ref can be found. It checks that a ref can be found by
 * a process holding NONE of the developer-machine inputs, which is the only version of the
 * question a runner asks.
 */

const ROOT = resolve(__dirname, '..');
const REF_FILE = resolve(ROOT, 'supabase/project-ref');
const SCRIPT = resolve(ROOT, 'scripts/push-email-templates.mjs');

/** A Supabase project ref: 20 lowercase letters, no digits in practice, but allow them. */
const REF_SHAPE = /^[a-z0-9]{15,}$/;

describe('the project ref resolves everywhere', () => {
  it('is committed, so a fresh checkout has it', () => {
    expect(existsSync(REF_FILE), 'supabase/project-ref is not committed').toBe(true);
    expect(readFileSync(REF_FILE, 'utf8').trim()).toMatch(REF_SHAPE);
  });

  it('is not a secret, and the thing that IS a secret stays out of the repo', () => {
    // The ref is the host part of NEXT_PUBLIC_SUPABASE_URL, which Next inlines into the
    // browser bundle — it is public by construction. The service-role key is not, and the
    // reason this file is safe must never become a reason to commit that one too.
    const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
    expect(tracked.split('\n'), '.env.local is tracked — it holds the service-role key').not.toContain('.env.local');
    const ref = readFileSync(REF_FILE, 'utf8').trim();
    expect(ref.length, 'that is too long to be a bare project ref — is it a key?').toBeLessThan(40);
    expect(ref, 'a Supabase key, not a ref').not.toMatch(/^(sb[a-z]?_|eyJ)/);
  });

  it('resolves in a FRESH CHECKOUT with no .env.local and no env vars', () => {
    // The actual regression, and it has to be run somewhere `.env.local` does not exist.
    //
    // My first version of this test unset the env vars and ran the script in this repo. It
    // passed with supabase/project-ref DELETED, because `.env.local` is sitting right here
    // and is the last fallback — so the test could not fail on the machine that wrote it,
    // which is the precise defect it was written to catch. Six of those on this project.
    //
    // So: assemble a synthetic fresh checkout in a temp dir — only the files git actually
    // tracks — and run the script there. That is what a runner has.
    const dir = mkdtempSync(join(tmpdir(), 'enforcee-ref-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      mkdirSync(join(dir, 'supabase/email'), { recursive: true });
      cpSync(SCRIPT, join(dir, 'scripts/push-email-templates.mjs'));
      cpSync(REF_FILE, join(dir, 'supabase/project-ref'));
      cpSync(resolve(ROOT, 'supabase/email'), join(dir, 'supabase/email'), { recursive: true });
      expect(existsSync(join(dir, '.env.local')), 'the fresh checkout is not fresh').toBe(false);

      const env = { ...process.env };
      delete env.NEXT_PUBLIC_SUPABASE_URL;
      delete env.SUPABASE_PROJECT_REF;
      env.SUPABASE_ACCESS_TOKEN = 'sbp_not_a_real_token_for_this_test';

      let output = '';
      try {
        output = execFileSync('node', [join(dir, 'scripts/push-email-templates.mjs'), '--check'], {
          cwd: dir,
          encoding: 'utf8',
          env,
          timeout: 60_000,
        });
      } catch (e: any) {
        output = harvest(e).output;
      }

      // Asserting only the ABSENCE of "No project ref" would pass for any number of
      // unrelated reasons, including the script dying earlier. Require positive evidence
      // that it got past the ref check and reached the network.
      expect(output, 'the ref did not resolve — the CI failure, reproduced').not.toMatch(/No project ref/);
      expect(output, 'never reached the API, so nothing is proven').toMatch(
        /project [a-z0-9]{15,}|Management API|NETWORK block/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('matches .env.local when that file is present', () => {
    // Drift control: two copies of one value is the duplicated-source bug, of which this
    // project has had ten. On a runner .env.local is absent — SAY SO rather than passing
    // silently, because a check that quietly covers nothing is this project's most repeated
    // failure (six so far).
    const envFile = resolve(ROOT, '.env.local');
    if (!existsSync(envFile)) {
      console.warn('  [skipped] no .env.local here — drift vs the dev environment was NOT checked');
      expect(true).toBe(true);
      return;
    }
    const fromEnv = readFileSync(envFile, 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
    // A .env.local with no Supabase URL in it is the SAME case as no .env.local at all: there
    // is nothing to compare, so there is no drift to report. This used to fail here — the
    // check announced "these two values disagree" when what had actually happened was that one
    // of them did not exist. A missing comparand is not a discrepancy.
    //
    // Reached by an ordinary action, not an exotic one: `npx vercel link` writes a .env.local
    // containing only VERCEL_OIDC_TOKEN, and docs/SETUP-ENFORCEMENT.md instructs you to run it.
    // Patrik hit this on 2026-08-16 within a minute of following our own setup document, on a
    // suite that was otherwise green.
    //
    // The skip is LOUD, exactly as the no-file skip above is loud. A check that cannot run must
    // say it did not run; what it must never do is either fail or pass silently.
    if (!fromEnv) {
      console.warn(
        '  [skipped] .env.local exists but names no Supabase URL — drift vs the dev environment was NOT checked'
      );
      expect(true).toBe(true);
      return;
    }
    expect(readFileSync(REF_FILE, 'utf8').trim(), 'committed ref has drifted from .env.local').toBe(fromEnv);
  });
});
