import { createHash } from 'node:crypto';
import type { CheckSpec, LengthScope, Rule, RuleSource } from '../types';

export const PARSER_VERSION = 'parse@1.0.0';

/** Rough token estimate. Good enough for budget/position warnings. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[-*+\d.)\s]+/, '')
    .replace(/[.;,:!]+$/, '')
    .trim();
}

export function ruleId(normalized: string): string {
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 12);
}

/** Words that mark a line as a directive rather than prose, wherever they appear. */
const IMPERATIVE =
  /\b(must|must not|mustn't|never|always|don't|do not|shall|should|should not|shouldn't|avoid|ensure|require[ds]?|required|prefer|use|only|no |not allowed|forbidden|refrain|limit|keep|write|respond|reply|answer|output|format|include|omit|exclude|cite|start|end|begin|finish)\b/i;

/**
 * A bare imperative in FIRST POSITION — the other half of how obligations are written.
 *
 * The list above is a vocabulary check and it misses the most ordinary form of an
 * instruction there is. A real AGENTS.md saying
 *
 *     Run `pnpm build` before you claim it compiles.
 *
 * was dropped on the floor, because "run" is not in the vocabulary. So was every rule
 * beginning Check, Verify, Add, Delete, Commit, Escape, Validate. Those are not exotic —
 * they are what handbooks are made of, and dropping them lowers the deterministic share
 * in a way that measures the parser rather than the engine. Same class of bug as the
 * Title Case one below.
 *
 * ANCHORING IS THE WHOLE SAFETY MECHANISM. Matched anywhere in a sentence, this list
 * would swallow ordinary description — "the CI job will run the tests", "we check the
 * digest", "the parser reads the file" are all statements of fact, not obligations. An
 * English imperative has no subject before its verb, so requiring the verb to be the
 * FIRST token is a cheap structural approximation of exactly that, with no tagger.
 *
 * Deliberately still conservative: a verb that is also a common noun (`file`, `list`,
 * `order`, `report`, `record`, `test`, `state`) is left out, because "File naming is
 * important" and "Test coverage is low" are not instructions and both begin with one.
 */
const IMPERATIVE_START = new RegExp(
  '^(?:please\\s+)?(' +
    [
      'run', 'check', 'verify', 'validate', 'confirm', 'assert',
      'add', 'remove', 'delete', 'rename', 'move', 'copy', 'replace',
      'update', 'commit', 'push', 'merge', 'rebase', 'revert',
      'build', 'compile', 'install', 'upgrade', 'pin', 'bump',
      'call', 'invoke', 'return', 'throw', 'raise', 'catch', 'handle',
      'wrap', 'escape', 'quote', 'sanitise', 'sanitize', 'normalise', 'normalize',
      'document', 'annotate', 'comment', 'explain', 'describe',
      'create', 'define', 'declare', 'implement', 'extract', 'inline', 'refactor',
      'import', 'export', 'expose', 'store', 'save', 'load', 'fetch', 'send',
      'reject', 'accept', 'treat', 'mark', 'tag', 'split', 'sort', 'apply',
      'follow', 'match', 'stop', 'skip', 'print', 'emit', 'close', 'open',
      'set', 'clear', 'reset', 'leave', 'put', 'place', 'read',
    ].join('|') +
    ')\\b',
  'i'
);

/** Does this sentence read as an obligation? */
function directive(text: string): boolean {
  return IMPERATIVE.test(text) || IMPERATIVE_START.test(text.trim());
}

/** Phrases so vague that no checker — human or machine — could adjudicate them. */
const UNENFORCEABLE =
  /^(be (helpful|nice|good|smart|careful|thoughtful|concise)|use (good |common )?(judgment|sense)|do your best|act professionally|be professional|think step by step|be accurate|write well|make it good)\b/i;

const CONDITIONAL = /^(when|whenever|if|for|while|during|unless|in case of|on)\b[^,.;]{2,80}[,.;]/i;

/**
 * Structural furniture that is never a rule, however it is formatted.
 *
 * Bullets used to be accepted unconditionally, which is correct for a hand-written CLAUDE.md
 * — there, every bullet IS a rule. It is badly wrong for a real document, where bullets are
 * also table-of-contents entries, definition lists, and section labels. Benchmarking against
 * the HANDBOOK corpus of real enterprise SOPs pulled in "Purpose and Scope" and
 * "Overview ......................." as rules, which then dragged the deterministic share
 * down to a number that measured the parser rather than the engine.
 *
 * Deliberately narrow. Each pattern rejects a shape that cannot be an obligation, rather
 * than trying to decide what is "rule-like" — a broad filter here would silently drop real
 * rules, which is far worse than admitting a few non-rules.
 */
const NOT_A_RULE: { why: string; re: RegExp }[] = [
  // Table of contents: dot leaders, with or without a trailing page number.
  { why: 'toc-leader', re: /\.{4,}\s*\d*\s*$/ },
  // "3.2 Vendor Onboarding" / "Section 4 — Scope": a numbered heading lifted into a list.
  { why: 'numbered-heading', re: /^\d+(\.\d+)*\s*[-–—.)]?\s*[A-Z][\w ,'&/-]{0,60}$/ },
  // A label introducing something else, e.g. "Required documents:" — the rule is below it.
  { why: 'trailing-colon-label', re: /^[A-Z][\w ,'&/-]{0,60}:$/ },
  // Bare page/figure/table references.
  { why: 'reference', re: /^(page|figure|table|appendix|exhibit|annex|section)\s+[\dA-Z]/i },
];

/**
 * A bullet has to look like it could carry an obligation.
 *
 * Weaker than IMPERATIVE on purpose. "- No emojis." and "- Tabs, not spaces." are real rules
 * in a hand-written ruleset and contain no modal verb, so requiring one would break exactly
 * the case the product is built for. This only rejects the shapes above, plus title-case
 * fragments with no verb at all — the residue of a heading.
 */
function couldBeRule(text: string): boolean {
  const t = text.trim();
  for (const { re } of NOT_A_RULE) if (re.test(t)) return false;

  // Title Case is the tell. A heading capitalises its significant words and lowercases its
  // connectives — "Purpose and Scope", "Overview & Purpose". A rule does not.
  //
  // Measured on the significant words only, because counting "and" as a lowercase word let
  // headings through: "Purpose and Scope" is 2 of 3 tokens capitalised, which looked like
  // ordinary prose, but 2 of 2 significant words, which is unmistakably a heading.
  //
  // A constraint word anywhere is an immediate keep. "No emojis." and "Tabs, not spaces."
  // are real rules in a hand-written ruleset, and losing those would break the product for
  // its primary case while making the benchmark look better — the exact trade to refuse.
  const STOP = /^(and|or|the|a|an|of|in|for|with|to|&)$/i;
  const CONSTRAINT = /\b(no|not|never|must|shall|always|avoid|only|don't|do not|use|require[ds]?)\b/i;
  if (CONSTRAINT.test(t)) return true;

  const words = t.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length <= 6) {
    const significant = words.filter((w) => !STOP.test(w.replace(/[^\w']/g, '')));
    const capitalised = significant.filter((w) => /^[A-Z]/.test(w)).length;
    if (significant.length >= 2 && capitalised >= Math.ceil(significant.length * 0.75)) return false;
  }
  return true;
}

/**
 * A line that cannot be the continuation of the paragraph above it.
 *
 * Deliberately the same set the bullet branch already stops at, plus a horizontal rule —
 * so the two branches agree on where a block ends instead of each having its own opinion.
 */
function endsProse(line: string): boolean {
  const t = line.trim();
  return (
    t === '' ||
    /^```/.test(t) ||
    /^#{1,6}\s/.test(t) ||
    /^\s*(?:[-*+]|\d+[.)])\s+/.test(line) ||
    /^([-*_])\1{2,}\s*$/.test(t)
  );
}

/** Prose blocks only join with their own kind: a quote never absorbs the paragraph below it. */
function proseKind(line: string): 'table' | 'quote' | 'plain' {
  const t = line.trim();
  if (t.startsWith('|')) return 'table';
  if (t.startsWith('>')) return 'quote';
  return 'plain';
}

interface RawRule {
  text: string;
  startLine: number;
  endLine: number;
  section: string[];
}

/**
 * Split a freeform ruleset (markdown, bullets, numbered lists, prose) into atomic rules.
 * Deterministic and dependency-free — same input always yields the same rule ids.
 */
/**
 * Bullets the splitter declined, with their line numbers.
 *
 * `couldBeRule` is a heuristic, and a heuristic that drops real obligations while saying
 * nothing is the worst kind. A support handbook whose bullets are Title Case — "Verify
 * Customer Identity Before Refund" — lost three of its four rules here and the receipt
 * reported a clean pass on the one that survived.
 */
export function skippedLines(text: string): { text: string; line: number }[] {
  const skipped: { text: string; line: number }[] = [];
  splitRules(text, 'ruleset', skipped);
  return skipped;
}

export function splitRules(text: string, artifact = 'ruleset', skipped: { text: string; line: number }[] = []): RawRule[] {
  const lines = text.split(/\r?\n/);
  const out: RawRule[] = [];
  const section: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || trimmed === '') continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const depth = heading[1].length;
      section.length = Math.max(0, depth - 1);
      section[depth - 1] = heading[2].trim();
      continue;
    }

    // Bullet or numbered item — one rule per item, continuation lines folded in.
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      let body = item[1].trim();
      let end = i;
      while (
        end + 1 < lines.length &&
        lines[end + 1].trim() !== '' &&
        !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[end + 1]) &&
        !/^#{1,6}\s/.test(lines[end + 1].trim()) &&
        /^\s{2,}/.test(lines[end + 1])
      ) {
        end++;
        body += ' ' + lines[end].trim();
      }
      if (couldBeRule(body)) out.push({ text: body, startLine: i + 1, endLine: end + 1, section: [...section] });
      else skipped.push({ text: body, line: i + 1 });
      i = end;
      continue;
    }

    // Prose paragraph. Markdown HARD-WRAPS, so a paragraph is a run of lines and a sentence
    // routinely crosses a line break. This used to hand each physical line to the sentence
    // splitter on its own, which meant a wrapped sentence was never one sentence: 53 of the
    // 98 prose rules taken from this repo's own markdown were mid-sentence fragments.
    //
    // That is a false accusation generator, not a cosmetic defect. Each half is classified
    // on whatever it happens to contain, so a backticked command sitting in a descriptive
    // clause became `required_literal` and every output that did not quote it verbatim was
    // reported VIOLATED with a deterministic badge. Found 2026-08-15 by running
    // `enforcee audit CLAUDE.md SETUP-EMAIL-AND-BILLING.md` — two violations, both of them
    // halves of one sentence in our own preamble that describes what the tool does.
    //
    // It also broke a guarantee that is not about parsing at all: rule ids are
    // content-addressed so a rule survives being reworded. Re-wrapping a paragraph is not
    // even a rewording, and it changed every id in it.
    const kind = proseKind(line);
    const strip = (l: string) => (kind === 'quote' ? l.trim().replace(/^>\s?/, '').trim() : l.trim());
    const parts: { text: string; line: number }[] = [{ text: strip(line), line: i + 1 }];
    let end = i;
    // A table row is a record, not a wrapped line. Joining rows would glue unrelated ones
    // into a single "sentence", so a table stays one unit per row.
    if (kind !== 'table') {
      while (end + 1 < lines.length && !endsProse(lines[end + 1]) && proseKind(lines[end + 1]) === kind) {
        const next = strip(lines[end + 1]);
        if (next === '') break;
        end++;
        parts.push({ text: next, line: end + 1 });
      }
    }

    // Join, keeping a char→line map so a sentence still reports the lines it came from.
    let joined = '';
    const lineOf: number[] = [];
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) {
        joined += ' ';
        lineOf.push(parts[p].line);
      }
      joined += parts[p].text;
      for (let k = 0; k < parts[p].text.length; k++) lineOf.push(parts[p].line);
    }

    const sentences = joined.split(/(?<=[.!?])\s+(?=[A-Z"'`])/);
    let cursor = 0;
    for (const s of sentences) {
      const at = joined.indexOf(s, cursor);
      const startOff = at < 0 ? cursor : at;
      cursor = startOff + s.length;
      const t = s.trim();
      if (t.length < 8) continue;
      if (!directive(t)) continue;
      const endOff = Math.min(startOff + s.length - 1, lineOf.length - 1);
      out.push({
        text: t,
        startLine: lineOf[startOff] ?? i + 1,
        endLine: lineOf[Math.max(startOff, endOff)] ?? i + 1,
        section: [...section],
      });
    }
    i = end;
  }

  return out.filter((r) => r.text.replace(/[^a-z0-9]/gi, '').length >= 6).map((r) => ({ ...r, artifact })) as RawRule[];
}

/** Pull a quoted or backticked literal out of a rule, if present. */
function literals(text: string): string[] {
  const found: string[] = [];
  const re = /[`"'“‘]([^`"'”’]{1,60})[`"'”’]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = m[1].trim();
    if (v.length >= 1) found.push(v);
  }
  return found;
}

const LANGUAGES: Record<string, string> = {
  english: 'en',
  hungarian: 'hu',
  magyar: 'hu',
  german: 'de',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  dutch: 'nl',
  polish: 'pl',
  japanese: 'ja',
  korean: 'ko',
  chinese: 'zh',
  russian: 'ru',
  turkish: 'tr',
  czech: 'cs',
  romanian: 'ro',
  slovak: 'sk',
};

/**
 * What a length limit is measured over.
 *
 * "Keep each bullet under 12 words" measured across the whole answer is a guaranteed
 * VIOLATED on any answer with two bullets, badged as proven by code. The distributive
 * words — each, every, per, any, no ... longer than — are the whole signal, and they are
 * unambiguous enough to read mechanically.
 */
export function lengthScope(lower: string): LengthScope {
  // A limit on something that is not the answer cannot be measured against the answer.
  if (/\b(commit message|commit messages|pr title|pull request title|branch name|file ?name|subject line|title|headline|slug|alt text|filename)\b/i.test(lower)) {
    return 'elsewhere';
  }

  const unit = /\b(?:each|every|per|any|all|no)\s+(?:\w+\s+){0,2}?(bullet|line|sentence|paragraph|section|item|point|entry|row|step|answer|response|reply|message|output)\b/i.exec(
    lower
  );
  if (!unit) return 'output';
  switch (unit[1].toLowerCase()) {
    case 'section':
      return 'paragraph';
    case 'bullet':
    case 'item':
    case 'point':
    case 'entry':
    case 'row':
    case 'step':
      return 'bullet';
    case 'line':
      return 'line';
    case 'sentence':
      return 'sentence';
    case 'paragraph':
      return 'paragraph';
    default:
      // "every answer", "each response" — the unit IS the whole output.
      return 'output';
  }
}

/**
 * Is this rule asking for citations, or does it merely contain a word that citations use?
 *
 * "Always use the source of truth in config.ts" contains "source" and "always", which was
 * the entire old test, and it was therefore compiled into a demand for a URL — reported
 * VIOLATED, with a deterministic badge, against an answer that never had any business
 * containing a link. Source, reference and link are among the most overloaded nouns in
 * software English.
 *
 * So: an unambiguous citing word, or an explicit construction, and never when the phrase
 * is one of the compounds where the noun means something else. Anything that misses here
 * falls through to the judge, which costs a model call and accuses no one.
 */
const NOT_A_CITATION =
  /\b(source code|sources? of truth|single source|open[- ]?sources?|source files?|source control|source maps?|data ?sources?|upstream sources?|reference implementations?|reference architectures?|reference manuals?|cross[- ]?references?|by reference|passed by reference|frame of reference|sym(?:bolic )?links?|hard links?|links? between|linke[dr]|linking (?:the|a|an|to)? ?(?:library|libraries|binary|object)|linker)\b/i;

const CITATION_CONSTRUCTION: RegExp[] = [
  // "cite", "citation", "cited" — this noun has one meaning.
  /\bcit(?:e|es|ed|ing|ation|ations)\b/i,
  // "include sources", "provide a link", "end with references"
  /\b(?:provide|include|add|give|supply|attach|append|list|end with|finish with|back(?:ed)? (?:it |them |this )?(?:up )?with|support(?:ed)? (?:it |them |claims? |statements? )?with)\b[^.]{0,40}?\b(?:sources?|references?|links?|urls?)\b/i,
  // "link to the docs", "with a link to"
  /\blinks?\s+to\b/i,
  // "sources for every claim", "a reference for each figure"
  /\b(?:sources?|references?|links?|urls?)\b[^.]{0,25}?\bfor\s+(?:every|each|all|any)\b/i,
];

/** Words that are never a code-fence language, however the sentence is shaped. */
const FENCE_STOP = new Set([
  'the', 'a', 'an', 'its', 'their', 'correct', 'right', 'proper', 'appropriate', 'relevant',
  'each', 'every', 'all', 'any', 'with', 'and', 'or', 'of', 'in', 'for', 'to', 'as', 'block',
  'blocks', 'fence', 'fences', 'code', 'language', 'name',
]);

/** A clause-opening word swept up by a needle capture is not a forbidden word. */
const CLAUSE_STARTER = new Set(['when', 'if', 'while', 'unless', 'in', 'for', 'to', 'at', 'on', 'with', 'the', 'a', 'an']);

export function isCitationRule(text: string): boolean {
  if (NOT_A_CITATION.test(text)) return false;
  return CITATION_CONSTRUCTION.some((re) => re.test(text));
}

/**
 * Classify a rule into a deterministic checker, or fall through to the judge.
 * Order matters: most specific patterns first.
 */
export function classify(text: string): CheckSpec {
  const t = text.trim();
  const lower = t.toLowerCase();
  // Polarity decides whether a pattern is something to demand or something to forbid, so
  // missing a negation inverts the rule. "Reject anything matching /debug/" read as a
  // POSITIVE requirement, and then reported VIOLATED against every answer that correctly
  // contained no "debug" — an accusation for obeying.
  const negative =
    /\b(never|don't|do not|must not|mustn't|avoid|no |without|refrain from|omit|exclude|forbidden|forbid|not allowed|reject|rejects|prohibit|prohibits|prohibited|disallow|disallows|disallowed|ban|bans|banned|off[- ]limits)\b/i.test(
      lower
    );

  // Explicit user regex: /pattern/flags
  //
  // Slashes are ordinary punctuation in English, so the shape alone is not consent.
  // "Never write to /etc/ or /tmp/ directly" parsed as the regex /etc/ — and "etc" is a
  // substring of "fetch", so every answer that used the word fetch was reported VIOLATED
  // with a code badge on it. A path is not a pattern, and reading one as the other turns a
  // sensible rule into a machine that accuses you at random.
  //
  // So we require a deliberate signal: a regex metacharacter inside the pattern, explicit
  // flags after it, or the rule saying in words that it means a pattern. Everything else
  // falls through to the literal and judged paths, which cost a model call at worst.
  const rx = /(?:^|\s)\/((?:[^/\\]|\\.){2,120})\/([gimsuy]{0,5})(?=[\s.,;:!?]|$)/.exec(t);
  if (rx) {
    const meta = /[\\^$.*+?()[\]{}|]/.test(rx[1]);
    const declared = /\b(regex|regexp|regular expression|pattern|matche?s?|matching)\b/i.test(lower);
    if (meta || rx[2].length > 0 || declared) {
      try {
        new RegExp(rx[1], rx[2]);
        return negative
          ? { kind: 'forbidden_regex', pattern: rx[1], flags: rx[2] || 'g' }
          : { kind: 'required_regex', pattern: rx[1], flags: rx[2] || 'g' };
      } catch {
        /* fall through */
      }
    }
  }

  if (/\bem[- ]?dash(es)?\b/i.test(lower) && negative) return { kind: 'no_em_dash' };
  if (/\bemoji(s)?\b/i.test(lower) && negative) return { kind: 'no_emoji' };

  const lang = /\b(?:respond|reply|answer|write|output)\b[^.]{0,40}\bin\s+([a-z]+)\b/i.exec(lower);
  if (lang && LANGUAGES[lang[1]]) {
    return { kind: 'language', code: LANGUAGES[lang[1]], name: lang[1] };
  }

  // "more than N words" is a CEILING when it is negated and a FLOOR when it is not, and the
  // first version only knew the single phrase "no more than". So "Don't use more than 200
  // words", "Never write more than 150 words", "Avoid using more than 100 words" all
  // compiled to min_words — the exact opposite of the rule — and a short, obedient answer
  // was reported VIOLATED for being under the limit it was asked to stay under. Obedience
  // was the only way to fail.
  const moreThan = /\b(?:more than|over|exceed(?:ing)?|beyond|longer than)\s+(\d{1,5})\s+words?\b/i.exec(lower);
  if (moreThan) {
    const n = Number(moreThan[1]);
    const scope = lengthScope(lower);
    return negative || /\bno more than\b/i.test(lower)
      ? { kind: 'max_words', n, scope }
      : { kind: 'min_words', n, scope };
  }

  const maxWords = /\b(?:no more than|at most|under|fewer than|less than|max(?:imum)? of|maximum|within|up to)\s+(\d{1,5})\s+words?\b/i.exec(lower);
  if (maxWords) return { kind: 'max_words', n: Number(maxWords[1]), scope: lengthScope(lower) };

  const minWords = /\b(?:at least|no fewer than|minimum of)\s+(\d{1,5})\s+words?\b/i.exec(lower);
  if (minWords) return { kind: 'min_words', n: Number(minWords[1]), scope: lengthScope(lower) };

  const moreChars = /\b(?:more than|over|exceed(?:ing)?|longer than)\s+(\d{1,6})\s+(?:characters|chars)\b/i.exec(lower);
  if (moreChars) {
    const n = Number(moreChars[1]);
    const scope = lengthScope(lower);
    return negative || /\bno more than\b/i.test(lower) ? { kind: 'max_chars', n, scope } : { kind: 'min_words', n, scope };
  }

  const maxChars = /\b(?:no more than|at most|under|max(?:imum)? of|within|up to)\s+(\d{1,6})\s+(?:characters|chars)\b/i.exec(lower);
  if (maxChars) return { kind: 'max_chars', n: Number(maxChars[1]), scope: lengthScope(lower) };

  if (/\b(valid\s+)?json\b/i.test(lower) && /\b(respond|reply|answer|output|return|format|as|in)\b/i.test(lower) && !negative) {
    // "Return the config as JSON" is satisfied by a JSON block inside an explanation.
    // "Reply with nothing but JSON" is not. Only the second licenses parsing the whole
    // output, so only the second sets strict.
    const strict =
      /\b(only|nothing but|just|solely|exclusively|entire|whole)\b/i.test(lower) ||
      /\bno (prose|commentary|explanation|preamble|other text|extra text)\b/i.test(lower);
    return { kind: 'format_json', strict };
  }

  if (/\b(markdown\s+)?table\b/i.test(lower) && /\b(use|include|present|format|as|show)\b/i.test(lower) && !negative) {
    return { kind: 'format_markdown_table' };
  }

  // "Always tag code blocks with the language" asked for a fence tagged ```the — the lazy
  // gap matched "with", then took the very next word as the language name, so a correctly
  // tagged ```bash block was VIOLATED and the only passing output was one tagged ```the.
  const fenceLang = /\bcode\s+(?:block|fence)s?\b[^.]{0,30}\b(?:tagged|labell?ed|marked|with|as)\b[^.]{0,20}?\b([a-z+#]{1,12})\b/i.exec(lower);
  if (fenceLang && !FENCE_STOP.has(fenceLang[1])) return { kind: 'code_fence_language', language: fenceLang[1] };

  // "Always tag code blocks with the language" names no language, and it is not a demand
  // for a code block either — it is a rule about the blocks you do write. Reading it as
  // `format_code_fence` reported VIOLATED against an answer that contained no code at all.
  if (/\b(?:tag|tags|tagged|tagging|label|labell?ed|labelling|mark|marked|annotate)\b/i.test(lower) && /\bcode\s+(?:block|fence)s?\b/i.test(lower) && !negative) {
    return { kind: 'code_fence_tagged' };
  }

  if (/\bcode\s+(?:block|fence)s?\b/i.test(lower) && !negative) return { kind: 'format_code_fence' };

  // The heading NAME, not the name plus every qualifier after it. "Add a section called Next
  // Steps at the end of every response" demanded a heading literally titled "Next Steps at
  // the end of every response", which no output can ever contain — an unsatisfiable rule,
  // reported as a violation rather than as the parse failure it was.
  const headingReq =
    /\b(?:section|heading)\b[^.]{0,20}\b(?:titled|called|named)\b\s*(?:["'`“]([^"'`”.]{2,50})["'`”]|((?:[A-Z][\w'-]*)(?:\s+(?:[A-Z][\w'-]*|of|and|the|for|to)){0,4}))/.exec(t);
  if (headingReq) {
    const heading = (headingReq[1] ?? headingReq[2] ?? '')
      .replace(/\s+(?:at|in|on|before|after|for|when|at the|in the)\b.*$/i, '')
      .trim();
    if (heading.length >= 2) return { kind: 'heading_required', heading };
  }

  /**
   * The way people ACTUALLY write this rule: the name comes BEFORE the word.
   *
   *     "Always end with a summary section."
   *     "Every answer must include a Summary heading."
   *
   * The pattern above only matches `section|heading … titled|called|named X`, which is the
   * formal phrasing almost nobody uses. Found 2026-08-16 by installing our own freshly
   * published 0.9.0 from npm as a stranger would, and auditing a two-rule CLAUDE.md: an
   * answer containing a literal `## Summary` came back UNVERIFIABLE for "always end with a
   * summary section".
   *
   * That is the worst shape a miss can take. The rule is trivially checkable, the output
   * plainly satisfies it, and the product answers "we could not tell" — which reads as the
   * engine being weak rather than the parser being narrow. It also pushes a free,
   * deterministic verdict onto the judged layer, lowering the share decided by code, which
   * is the number the whole pitch rests on.
   *
   * Deliberately narrow: the name must be capitalised or a known section word, so "include a
   * long section" and "add a heading" — which name nothing — stay judged rather than
   * compiling into a hunt for a heading literally called "long" or "a". That is the
   * unsatisfiable-rule failure recorded directly above.
   */
  const namedFirst =
    /\b(?:with|include[sd]?|add|ends? with|containing|contains?)\s+(?:an?|the)?\s*["'`“]?((?:[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,3})|summary|conclusion|references|sources|caveats|limitations|next steps|examples)["'`”]?\s+(?:section|heading)\b/i.exec(
      t
    );
  if (!negative && namedFirst) {
    const heading = (namedFirst[1] ?? '').trim();
    if (heading.length >= 3 && !/^(a|an|the|it|this|that|each|every|any|new|long|short)$/i.test(heading)) {
      return { kind: 'heading_required', heading };
    }
  }

  if (!negative && isCitationRule(t)) return { kind: 'citation_required' };

  // A rule about DOING something is not a rule about the text containing something.
  //
  // "Always run `npm test` before committing" was being read as required_literal — the
  // backticked command extracted, then required to appear in the model's output — and
  // reported VIOLATED because the answer did not contain the string "npm test". That is a
  // FALSE ACCUSATION, and "zero false accusations" is on the landing page. Found by walking
  // a first run as a stranger, on a ruleset any real user would write.
  //
  // These rules are not judged-instead-of-deterministic. No reading of a text output settles
  // whether a command was run, by us or by anyone. The honest answer is that this needs the
  // environment, which is what `enforcee verify` reads.
  //
  // Deliberately narrow: it fires only on an action verb, and never when the rule is
  // explicitly about the text ("include", "mention", "start with"). A missed action rule
  // costs an unnecessary judged call; a false positive here costs someone's trust.
  // `call` is not on this list, and the reason is a missed violation rather than a false
  // one: `Never call a defect a "bug"` is a rule about WORDS. It was classified as an
  // action, so it resolved to UNVERIFIABLE — and an output that used the word "bug" ten
  // times passed a check that was one string comparison away from proving otherwise. A rule
  // silently exempted from checking is the failure this product exists to name, and it
  // reads exactly like compliance.
  const ACTION_VERB =
    /\b(run|execute|invoke|deploy|publish|commit|push|escalate|notify|approve|verify|obtain|submit|install|restart|migrate|retain|archive|revoke|rotate|back ?up|sign off|hand off|assign|route)\b/i;
  // Naming verbs need an object to be naming verbs. A bare `\bcall\b` also matches the
  // "call" in "on-call engineer", which sent "Escalate to the on-call engineer within 15
  // minutes" — an action rule if there ever was one — back to the judge.
  const ABOUT_TEXT =
    /\b(include|includes|contain|contains|mention|mentions|say|says|write|writes|start with|end with|use the word|word|phrase|spell|spelled|capitali[sz]e|output|respond|reply|format)\b|\b(?:call|calls|called|calling|refer to|describe|describes|label|labels|name)\s+(?:it|them|that|this|a|an|the|any|every|each)\b/i;
  if (ACTION_VERB.test(t) && !ABOUT_TEXT.test(t)) {
    return { kind: 'action', hint: 'enforcee verify' };
  }

  // Quoted literals are the highest-signal deterministic case.
  const lits = literals(t);
  if (lits.length > 0) {
    // A CONTRAST rule names both the right answer and the wrong one, and reading every
    // literal as an OR-ed requirement got it wrong in both directions at once. `Use British
    // spelling: "colour", not "color"` was satisfied by an output containing "color", and
    // VIOLATED by an output that never mentioned either. Only the forbidden half is
    // checkable without knowing whether the topic came up, so only that half is checked.
    const contrast = /\b(?:not|never|instead of|rather than|over|and not|but not)\b/i.exec(t);
    if (contrast && lits.length >= 2) {
      const after = lits.filter((l) => t.indexOf(l, contrast.index) > -1 && t.indexOf(l) > contrast.index);
      if (after.length) return { kind: 'forbidden_literal', needles: after, caseSensitive: false };
    }
    return negative
      ? { kind: 'forbidden_literal', needles: lits, caseSensitive: false }
      : { kind: 'required_literal', needles: lits, caseSensitive: false };
  }

  // "never use the word X" / "avoid the phrase X" without quotes.
  //
  // Bounded to the word itself. `([a-z][a-z' -]{1,40})` ran straight past it into the rest
  // of the sentence, so "Never use the word just when explaining code" forbade the string
  // "just when explaining code" — which no output will ever contain. A needle that cannot
  // match is a guaranteed FOLLOWED, badged deterministic: a rule that reports itself obeyed
  // forever.
  const wordAfter = /\b(?:the\s+)?(?:word|phrase|term)s?\s+([a-z][a-z'-]{1,24}(?:\s*(?:,|\bor\b|\band\b)\s*[a-z][a-z'-]{1,24}){0,4})/i.exec(t);
  if (wordAfter && negative) {
    const needles = wordAfter[1]
      .split(/\s*(?:,|\bor\b|\band\b)\s*/i)
      .map((w) => w.trim())
      .filter((w) => w.length > 1 && !CLAUSE_STARTER.has(w.toLowerCase()));
    if (needles.length) return { kind: 'forbidden_literal', needles, caseSensitive: false };
  }

  if (UNENFORCEABLE.test(lower)) {
    return { kind: 'judged', reason: 'Rule is too vague to check mechanically or reliably adjudicate.' };
  }

  return { kind: 'judged', reason: 'No deterministic checker matches this rule; adjudicated by model with verified evidence.' };
}

/**
 * A condition at the END of the rule is still a condition.
 *
 * Only a LEADING clause was recognised, so "Use code blocks for shell commands" and "Use a
 * markdown table when comparing options" both parsed as unconditional demands and reported
 * VIOLATED against every answer that contained no shell command and compared nothing. The
 * scope was written down; it was simply not read.
 */
const TRAILING_CONDITIONAL =
  /\b(when|whenever|if|unless|while|during|for|in)\s+((?:[a-z][\w'-]*\s+){0,5}?[a-z][\w'-]*)\s*$/i;

export function extractTrigger(text: string): string | null {
  const t = text.trim().replace(/[.!?]$/, '');
  const lead = CONDITIONAL.exec(t);
  if (lead) return lead[0].replace(/[,.;]$/, '').trim();
  const trail = TRAILING_CONDITIONAL.exec(t);
  if (trail) {
    // "for" and "in" are prepositions far more often than conditions. Require the object to
    // read like a case rather than a place.
    if (/^(for|in)$/i.test(trail[1]) && !/\b(command|commands|case|cases|example|examples|snippet|snippets|code|error|errors|option|options|comparison|comparisons|list|lists|table|tables)\b/i.test(trail[2])) {
      return null;
    }
    return trail[0].trim();
  }
  return null;
}

export function isUnenforceable(text: string): boolean {
  return UNENFORCEABLE.test(text.trim().toLowerCase());
}

export interface ParseResult {
  rules: Rule[];
  totalTokens: number;
}

export function parseRuleset(text: string, artifact = 'ruleset'): ParseResult {
  const raw = splitRules(text, artifact);
  const totalChars = Math.max(1, text.length);
  const seen = new Set<string>();
  const rules: Rule[] = [];

  // Offset of each line so we can compute a rule's position in the context window.
  const lineOffsets: number[] = [0];
  for (const line of text.split(/\r?\n/)) lineOffsets.push(lineOffsets[lineOffsets.length - 1] + line.length + 1);

  for (const r of raw) {
    const normalized = normalize(r.text);
    if (normalized.length < 4) continue;
    const id = ruleId(normalized);
    // Keep duplicates out of the rule list but surface them via health findings.
    if (seen.has(id)) continue;
    seen.add(id);

    const source: RuleSource = {
      startLine: r.startLine,
      endLine: r.endLine,
      section: r.section,
      artifact: (r as RawRule & { artifact?: string }).artifact ?? artifact,
    };

    rules.push({
      id,
      text: r.text,
      normalized,
      source,
      check: classify(r.text),
      trigger: extractTrigger(r.text),
      position: Math.min(1, (lineOffsets[r.startLine - 1] ?? 0) / totalChars),
      tokens: estimateTokens(r.text),
    });
  }

  return { rules, totalTokens: estimateTokens(text) };
}

/** Duplicates are dropped from the rule list; this recovers them for the health report. */
export function findDuplicates(text: string, artifact = 'ruleset'): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of splitRules(text, artifact)) {
    const id = ruleId(normalize(r.text));
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
