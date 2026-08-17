import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE RELEASE GATE MUST STILL BE ABLE TO OPEN.
 *
 * The gate publishes to npm automatically when six conditions hold. Condition 4 is a
 * cooling-off period: the release content should have been seen by an audit run before it
 * ships. It read `git log -1 HEAD`, and that was correct for as long as nothing pushed
 * automatically — HEAD aged overnight and the condition cost nothing.
 *
 * On 2026-08-17 four scheduled jobs were given push credentials, so their work would stop
 * stranding in project docs when a container was reclaimed. Every one of their pushes resets
 * a HEAD-based clock. They run hourly from 00:00 to 12:00; this gate runs at 10:00. HEAD would
 * essentially never be twelve hours old again, and the release path would have been starved by
 * the very change that fixed the stranded-work problem — silently, with no error anywhere,
 * while a security release sat unpublished on main. Filed as 3b10aeceee.
 *
 * The fix measures the VERSION BUMP instead, which is the intent signal condition 1 already
 * relies on. Commits landing after the bump are not unchecked: condition 5 requires CI green
 * on all three platforms for HEAD itself, every run.
 *
 * A workflow is not covered by the suite that runs inside it, so these are structural checks
 * on the YAML. That is a weaker instrument than executing it, and saying so is the point:
 * the real control is a release actually happening, which is observable on npm.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATE = readFileSync(join(ROOT, '.github', 'workflows', 'auto-release.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Lines that do something, i.e. not YAML comments. */
const active = GATE.split('\n').filter((l) => !/^\s*#/.test(l));

describe('the auto-release gate can still open', () => {
  it('reads the file it is meant to check', () => {
    // Rule 9. An unreadable or renamed workflow must fail here rather than pass everything.
    expect(GATE.length, 'auto-release.yml is empty or missing').toBeGreaterThan(500);
    expect(GATE).toMatch(/npm view enforcee version/);
    expect(GATE, 'the cooling-off condition is gone entirely').toMatch(/43200/);
  });

  it('measures cooling-off from the version bump, not from HEAD', () => {
    // The regression that would starve the gate. `git log -1 --format=%ct HEAD` anywhere in an
    // active line means any push — including one from a scheduled job minutes earlier — resets
    // the clock and the gate never opens.
    const offenders = active.filter((l) => /git log -1 --format=%ct\s+HEAD\b/.test(l));
    expect(
      offenders,
      'cooling-off is measured on HEAD again. Four scheduled jobs push daily, so HEAD is ' +
        'almost never 12h old and the gate will never open — a release path that fails by ' +
        'going quiet, which is the worst way for this particular thing to fail.'
    ).toEqual([]);
  });

  it('and it derives that bump from package.json rather than guessing', () => {
    expect(GATE, 'the gate no longer locates the version-bump commit').toMatch(
      /BUMP_SHA=\$\(git log -1 --format=%H -S/
    );
    expect(GATE, 'the bump lookup is not scoped to package.json, so any file could satisfy it').toMatch(
      /-S.*-- package\.json/
    );
    // If the lookup returns nothing the gate must refuse, not fall through to an age of zero
    // — which would read as "infinitely old" and publish instantly.
    expect(GATE, 'an unresolvable bump commit does not fail the gate closed').toMatch(
      /-n "\$BUMP_SHA".*\|\|\s*fail/s
    );
  });

  it('still demands CI green on every platform for HEAD itself', () => {
    // The half that makes measuring the bump safe. Without this, commits landing after the
    // bump would ship unverified.
    expect(GATE).toMatch(/head_sha=\$SHA/);
    expect(GATE).toMatch(/CONCLUSIONS.*=.*"success"|\[ "\$CONCLUSIONS" = "success" \]/s);
  });

  it('keeps every other condition that has to hold before anything publishes', () => {
    for (const [what, pattern] of [
      ['a version different from npm', /VERSION" != "\$PUBLISHED/],
      ['release notes for that exact version', /RELEASES\.md has no section/],
      ['INVARIANTS.md unchanged since the last tag', /INVARIANTS\.md changed since/],
      ['our own ruleset still compiling', /npm run dogfood \|\| fail/],
    ] as [string, RegExp][]) {
      expect(pattern.test(GATE), `the gate no longer requires: ${what}`).toBe(true);
    }
  });
});
