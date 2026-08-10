import { createHash } from 'node:crypto';
import type { CheckSpec, Rule, RuleSource } from '../types';

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

/** Words that mark a line as a directive rather than prose. */
const IMPERATIVE =
  /\b(must|must not|mustn't|never|always|don't|do not|shall|should|should not|shouldn't|avoid|ensure|require[ds]?|required|prefer|use|only|no |not allowed|forbidden|refrain|limit|keep|write|respond|reply|answer|output|format|include|omit|exclude|cite|start|end|begin|finish)\b/i;

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
export function splitRules(text: string, artifact = 'ruleset'): RawRule[] {
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
      i = end;
      continue;
    }

    // Prose paragraph: split into sentences, keep the directive-looking ones.
    const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z"'`])/);
    for (const s of sentences) {
      const t = s.trim();
      if (t.length < 8) continue;
      if (!IMPERATIVE.test(t)) continue;
      out.push({ text: t, startLine: i + 1, endLine: i + 1, section: [...section] });
    }
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
 * Classify a rule into a deterministic checker, or fall through to the judge.
 * Order matters: most specific patterns first.
 */
export function classify(text: string): CheckSpec {
  const t = text.trim();
  const lower = t.toLowerCase();
  const negative = /\b(never|don't|do not|must not|mustn't|avoid|no |without|refrain from|omit|exclude|forbidden|not allowed)\b/i.test(lower);

  // Explicit user regex: /pattern/flags
  const rx = /(?:^|\s)\/((?:[^/\\]|\\.){2,120})\/([gimsuy]{0,5})(?=\s|$)/.exec(t);
  if (rx) {
    try {
      new RegExp(rx[1], rx[2]);
      return negative
        ? { kind: 'forbidden_regex', pattern: rx[1], flags: rx[2] || 'g' }
        : { kind: 'required_regex', pattern: rx[1], flags: rx[2] || 'g' };
    } catch {
      /* fall through */
    }
  }

  if (/\bem[- ]?dash(es)?\b/i.test(lower) && negative) return { kind: 'no_em_dash' };
  if (/\bemoji(s)?\b/i.test(lower) && negative) return { kind: 'no_emoji' };

  const lang = /\b(?:respond|reply|answer|write|output)\b[^.]{0,40}\bin\s+([a-z]+)\b/i.exec(lower);
  if (lang && LANGUAGES[lang[1]]) {
    return { kind: 'language', code: LANGUAGES[lang[1]], name: lang[1] };
  }

  const maxWords = /\b(?:no more than|at most|under|fewer than|less than|max(?:imum)? of|maximum|within)\s+(\d{1,5})\s+words?\b/i.exec(lower);
  if (maxWords) return { kind: 'max_words', n: Number(maxWords[1]) };

  const minWords = /\b(?:at least|no fewer than|minimum of|more than)\s+(\d{1,5})\s+words?\b/i.exec(lower);
  if (minWords) return { kind: 'min_words', n: Number(minWords[1]) };

  const maxChars = /\b(?:no more than|at most|under|max(?:imum)? of|within)\s+(\d{1,6})\s+(?:characters|chars)\b/i.exec(lower);
  if (maxChars) return { kind: 'max_chars', n: Number(maxChars[1]) };

  if (/\b(valid\s+)?json\b/i.test(lower) && /\b(respond|reply|answer|output|return|format|as|in)\b/i.test(lower) && !negative) {
    return { kind: 'format_json' };
  }

  if (/\b(markdown\s+)?table\b/i.test(lower) && /\b(use|include|present|format|as|show)\b/i.test(lower) && !negative) {
    return { kind: 'format_markdown_table' };
  }

  const fenceLang = /\bcode\s+(?:block|fence)s?\b[^.]{0,30}\b(?:tagged|labell?ed|marked|with)\b[^.]{0,20}?\b([a-z+#]{1,12})\b/i.exec(lower);
  if (fenceLang) return { kind: 'code_fence_language', language: fenceLang[1] };

  if (/\bcode\s+(?:block|fence)s?\b/i.test(lower) && !negative) return { kind: 'format_code_fence' };

  const headingReq = /\b(?:section|heading)\b[^.]{0,20}\b(?:titled|called|named)\b\s*["'`“]?([^"'`”.]{2,50})/i.exec(t);
  if (headingReq) return { kind: 'heading_required', heading: headingReq[1].trim() };

  if (/\b(cite|citation|source|reference|link)s?\b/i.test(lower) && /\b(always|must|include|provide|add|end with|required)\b/i.test(lower) && !negative) {
    return { kind: 'citation_required' };
  }

  // Quoted literals are the highest-signal deterministic case.
  const lits = literals(t);
  if (lits.length > 0) {
    return negative
      ? { kind: 'forbidden_literal', needles: lits, caseSensitive: false }
      : { kind: 'required_literal', needles: lits, caseSensitive: false };
  }

  // "never use the word X" / "avoid the phrase X" without quotes
  const wordAfter = /\b(?:the\s+)?(?:word|phrase|term)s?\s+([a-z][a-z' -]{1,40})/i.exec(t);
  if (wordAfter && negative) {
    const needles = wordAfter[1]
      .split(/\s*(?:,|\bor\b|\band\b)\s*/i)
      .map((w) => w.trim())
      .filter((w) => w.length > 1);
    if (needles.length) return { kind: 'forbidden_literal', needles, caseSensitive: false };
  }

  if (UNENFORCEABLE.test(lower)) {
    return { kind: 'judged', reason: 'Rule is too vague to check mechanically or reliably adjudicate.' };
  }

  return { kind: 'judged', reason: 'No deterministic checker matches this rule; adjudicated by model with verified evidence.' };
}

export function extractTrigger(text: string): string | null {
  const m = CONDITIONAL.exec(text.trim());
  return m ? m[0].replace(/[,.;]$/, '').trim() : null;
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
