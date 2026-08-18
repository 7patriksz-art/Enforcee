/**
 * A RUN CONTRACT: what this run is for, and how we will know it worked.
 *
 * Written BEFORE the work starts. That ordering is the whole point — acceptance criteria
 * decided afterwards get chosen to flatter whatever happened, which is the single failure
 * that has cost this project most, on both sides of the keyboard.
 */
import type { Precondition } from '../prevent/preconditions';

export type RequirementKind =
  | 'do' // an action the prompt asks for
  | 'constraint' // a bound on how it is done
  | 'question'; // something the prompt asks to be answered

export interface Requirement {
  /** Content-addressed: R- + sha256 prefix of the normalised text. Stable across runs. */
  id: string;
  text: string;
  kind: RequirementKind;
  /** 1-indexed line in the prompt this came from, so a person can check the reading. */
  line: number;
}

/**
 * How we will know a requirement was met.
 *
 * `run` is a real command. Prose acceptance is how "done" becomes an opinion, so it is not
 * allowed here — a criterion with no command is pending and somebody must write one.
 */
export interface Acceptance {
  /** A- + sha256 prefix. */
  id: string;
  /** The requirement this proves. */
  for: string;
  /** Shell command whose result settles it, or null when nobody has written one yet. */
  run: string | null;
  /** The command's output must contain this. Empty means "exit 0 is enough". */
  expect: string;
  /** Plain language, for the person reading the report. */
  why: string;
}

/** A precondition that failed and that no machine can resolve — the batched ask. */
export interface Blocker {
  target: string;
  why: string;
  /** What the person has to do, concretely. Never "configure X". */
  action: string;
}

export interface Brief {
  v: 1;
  /** Content-addressed on the prompt, so the same prompt is the same brief. */
  id: string;
  prompt: string;
  /** ISO string. Injected, never read from the clock inside pure code. */
  createdAt: string;
  requirements: Requirement[];
  /** Reused wholesale from src/lib/prevent — one prober, not two. */
  preconditions: Precondition[];
  acceptance: Acceptance[];
  blockers: Blocker[];
  /** Path to the ruleset in force, if one was found. */
  rules: string | null;
}
