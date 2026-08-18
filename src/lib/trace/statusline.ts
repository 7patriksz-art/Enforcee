/**
 * THE STATUS LINE — the one place Enforcee is always visible.
 *
 * Patrik, 2026-08-18: *"maybe it should have its own tab or progress bar or file or at the end
 * of an ai work... keep the trace minimal but visually pleasant to look at (because people
 * would like to bother with their projects not with us)."*
 *
 * Claude Code renders a configured status line under every turn, re-drawing it each time an
 * assistant message arrives. It is the only persistent surface a third-party tool can occupy —
 * plugins are documented as unable to create panels, sidebars or always-visible widgets — so
 * this is the whole of "show up in the session", and it has to earn its row.
 *
 * WHAT GOES IN IT, and what does not:
 *
 *   IDENTITY   what this project has taught Enforcee — rules compiled, obstacles learned.
 *              This is the half that says "personalised to THIS repo", and it is why the
 *              line is worth a row even on a quiet day.
 *   ACTIVITY   what happened in this session, COUNTED FROM THE LEDGER, same as everything
 *              else. Nothing here is asserted.
 *
 * Never a claim. `renderStatusLine` cannot say "protected" or "secure" because there is no
 * row in the ledger that would make it true, and tests/statusline.test.ts holds that line.
 * The most important state is the honest one: when enforcement is off, it says so on every
 * single turn rather than sitting there implying cover it is not providing.
 */

import type { Trace } from './summary';

export interface Presence {
  /** A compiled policy exists in this project. Without it Enforcee is not here at all. */
  installed: boolean;
  /** Rules compiled into the policy — deny plus warn. What it is holding you to. */
  rules: number;
  /** Obstacles learned from this project's own history. The personalised half. */
  learned: number;
  /** Enforcement is licensed and live. False means auditing only, and it must say so. */
  enforcing: boolean;
  /** This session's counts, from the ledger. */
  trace: Trace;
}

const ESC = '\u001b[';
const C = {
  /** The mark. One colour, used once, so the eye finds it and then moves on. */
  brand: (s: string) => `${ESC}38;5;141m${s}${ESC}0m`,
  red: (s: string) => `${ESC}31m${s}${ESC}0m`,
  amber: (s: string) => `${ESC}33m${s}${ESC}0m`,
  green: (s: string) => `${ESC}32m${s}${ESC}0m`,
  grey: (s: string) => `${ESC}90m${s}${ESC}0m`,
};
const PLAIN: typeof C = {
  brand: (s) => s,
  red: (s) => s,
  amber: (s) => s,
  green: (s) => s,
  grey: (s) => s,
};

/** The mark. A filled hexagon: one character, reads at any size, no emoji-width surprises. */
export const MARK = '⬢';

/**
 * ONE LINE, and it must survive being looked at forty times an hour.
 *
 * Ordered so the eye lands on the same thing every time: mark, what it knows about this
 * project, then what it did. Only non-zero counts appear, and `allowed` is the denominator
 * that stops a block count being a number without a scale.
 */
export function renderStatusLine(p: Presence, colour = true): string {
  const c = colour ? C : PLAIN;
  const mark = c.brand(`${MARK} enforcee`);

  // NOT INSTALLED IS NOT A QUIET SUCCESS. If someone has this status line configured and no
  // policy compiled, the honest thing is to say the tool is not doing anything here — the
  // same distinction the trace draws between an empty ledger and a clean session.
  if (!p.installed) return `${mark} ${c.grey('· not installed in this project')}`;

  const known: string[] = [`${p.rules} rule${p.rules === 1 ? '' : 's'}`];
  if (p.learned) known.push(`${p.learned} learned`);

  // ENFORCEMENT OFF HAS TO BE LOUD, on every turn, not once at session start where it
  // scrolls away. A status line that looks identical whether or not it is stopping anything
  // is worse than no status line: it implies cover that is not there.
  if (!p.enforcing) {
    return `${mark} ${c.grey(`· ${known.join(' · ')} ·`)} ${c.amber('auditing only')}`;
  }

  const t = p.trace;
  const acts: string[] = [];
  if (t.blocked) acts.push(c.red(`${t.blocked} blocked`));
  if (t.unmet) acts.push(c.red(`${t.unmet} unmet`));
  if (t.refuted) acts.push(c.red(`${t.refuted} refuted`));
  if (t.warned) acts.push(c.amber(`${t.warned} warned`));
  if (t.unsettled) acts.push(c.amber(`${t.unsettled} unsettled`));
  if (t.verified) acts.push(c.green(`${t.verified} verified`));
  if (t.allowed) acts.push(c.grey(`${t.allowed} allowed`));

  // Nothing has reached the guard yet this session. "watching" is the truthful word: it is
  // installed and live and has not had to do anything, which is different from 0 blocked.
  const right = acts.length ? acts.join(c.grey(' · ')) : c.grey('watching');
  return `${mark} ${c.grey(`· ${known.join(' · ')} ·`)} ${right}`;
}
