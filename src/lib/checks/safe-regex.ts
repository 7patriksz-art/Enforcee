/**
 * Refusing to run a regex that could hang us.
 *
 * Rules can contain a literal pattern — `Never match /(x+x+)+y/` — and we compile it and
 * run it against up to 200,000 characters of somebody's output. V8's regex engine is
 * backtracking and **not interruptible**: once `exec` starts, nothing can stop it. Not a
 * timeout, not an abort signal, not the function's own maxDuration. The event loop is
 * pinned until it finishes or the platform kills the process.
 *
 * That made a 91-byte request a denial-of-service against the one path we deliberately
 * never meter. Measured before this file existed: `/^(a+)+$/` against 33 characters took
 * 117 seconds end to end.
 *
 * The honest fix is not a cleverer timeout — there isn't one. It is to decline patterns
 * whose shape permits exponential backtracking, and say so. That fits what this product
 * is: a rule we cannot check safely becomes UNVERIFIABLE with a reason, which is the same
 * thing we do with any other rule we cannot settle. We would rather refuse out loud than
 * quietly take the machine down.
 *
 * This is intentionally conservative. It rejects some patterns that would have been fine.
 * A false refusal costs one clearly-explained UNVERIFIABLE verdict; a false accept costs
 * the deployment.
 */

/** Hard ceiling on text any user-authored pattern is run against. */
export const MAX_REGEX_INPUT = 40_000;

export interface RegexVerdict {
  safe: boolean;
  /** Written for the person whose rule was refused, not for a log. */
  reason?: string;
}

const QUANTIFIER = /[*+]|\{\d*,\d*\}|\{\d+,\}/;

/**
 * Find the body of every group that carries an unbounded quantifier.
 *
 * Walks the pattern once tracking escapes and character classes, so `\(` and `[(]` are
 * not mistaken for group openers.
 */
function quantifiedGroupBodies(pattern: string): string[] {
  const bodies: string[] = [];
  const stack: number[] = [];
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];

    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c === '(') {
      stack.push(i);
      continue;
    }
    if (c === ')') {
      const open = stack.pop();
      if (open === undefined) continue;
      // What follows the close paren decides whether this group repeats.
      const after = pattern.slice(i + 1, i + 8);
      if (QUANTIFIER.test(after.slice(0, 1)) || /^\{\d*,\d*\}/.test(after) || /^\{\d+,\}/.test(after)) {
        bodies.push(pattern.slice(open + 1, i));
      }
    }
  }
  return bodies;
}

/** Does this fragment contain its own unbounded repetition? */
function hasInnerRepetition(body: string): boolean {
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c === '*' || c === '+') return true;
    if (c === '{' && /^\{\d*,\d*\}/.test(body.slice(i))) return true;
    if (c === '?' && i > 0) {
      // `x?` inside a repeated group is the (\w+\s?)+ shape — same exponential family.
      const prev = body[i - 1];
      if (prev !== '*' && prev !== '+' && prev !== '?' && prev !== '(') return true;
    }
  }
  return false;
}

/** Alternation with branches that can match the same text — the (a|a)+ shape. */
function hasAmbiguousAlternation(body: string): boolean {
  let depth = 0;
  let inClass = false;
  const branches: string[] = [];
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      current += c + (body[i + 1] ?? '');
      i++;
      continue;
    }
    if (inClass) {
      current += c;
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      current += c;
      continue;
    }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === '|' && depth === 0) {
      branches.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  branches.push(current);
  if (branches.length < 2) return false;

  // Two branches that are identical, or that both start with the same single-char
  // matcher, can both consume the same input — which is what makes the repetition
  // exponential rather than linear.
  const heads = branches.map((b) => b.trim().slice(0, 2));
  return new Set(heads).size < heads.length;
}

/**
 * Is this pattern safe to run against untrusted text?
 *
 * `source` is the regex body without delimiters, as stored on a CheckSpec.
 */
export function checkRegexSafety(source: string): RegexVerdict {
  if (source.length > 200) {
    return { safe: false, reason: 'the pattern is longer than 200 characters' };
  }

  for (const body of quantifiedGroupBodies(source)) {
    if (hasInnerRepetition(body)) {
      return {
        safe: false,
        reason:
          'it repeats a group that already repeats — a shape that can take exponential time on ordinary input',
      };
    }
    if (hasAmbiguousAlternation(body)) {
      return {
        safe: false,
        reason: 'it repeats a group whose alternatives can match the same text, which can take exponential time',
      };
    }
  }

  return { safe: true };
}

/** Compile a user pattern, or explain why we will not. */
export function safeCompile(source: string, flags: string): { re: RegExp } | { error: string } {
  const verdict = checkRegexSafety(source);
  if (!verdict.safe) {
    return { error: `This pattern was not run because ${verdict.reason}. Rewrite it more simply and it will be checked.` };
  }
  try {
    return { re: new RegExp(source, flags) };
  } catch {
    return { error: 'This pattern is not valid regular-expression syntax, so it could not be checked.' };
  }
}

/** Never hand a user-authored pattern the whole haystack. */
export function boundInput(text: string): { text: string; truncated: boolean } {
  return text.length <= MAX_REGEX_INPUT
    ? { text, truncated: false }
    : { text: text.slice(0, MAX_REGEX_INPUT), truncated: true };
}
