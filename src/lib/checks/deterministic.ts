import type { EvidenceSpan, LengthScope, Rule, RuleResult } from '../types';
import { boundInput, checkRegexSafety, safeCompile } from './safe-regex';

export const DETERMINISTIC_VERSION = 'det@1.0.0';

/** Build an offset-verified evidence span. Returns null if the quote isn't literally there. */
export function span(output: string, start: number, length: number): EvidenceSpan | null {
  if (start < 0 || start + length > output.length) return null;
  return { start, end: start + length, quote: output.slice(start, start + length) };
}

function findAll(haystack: string, needle: string, caseSensitive: boolean, limit = 5): EvidenceSpan[] {
  if (!needle) return [];
  const h = caseSensitive ? haystack : haystack.toLowerCase();
  const n = caseSensitive ? needle : needle.toLowerCase();
  const spans: EvidenceSpan[] = [];
  let i = h.indexOf(n);
  while (i !== -1 && spans.length < limit) {
    spans.push({ start: i, end: i + needle.length, quote: haystack.slice(i, i + needle.length) });
    i = h.indexOf(n, i + Math.max(1, n.length));
  }
  return spans;
}

/**
 * Run a user-authored pattern, or decline.
 *
 * Returns `null` — distinct from an empty array — when the pattern was refused, so the
 * caller can report UNVERIFIABLE with a reason instead of silently reporting "no match",
 * which would be a false clean bill of health.
 */
function regexSpans(output: string, pattern: string, flags: string, limit = 5): EvidenceSpan[] | null {
  const f = flags.includes('g') ? flags : flags + 'g';
  const compiled = safeCompile(pattern, f);
  if ('error' in compiled) return null;
  const re = compiled.re;
  // Bound the haystack as well as the pattern. Belt and braces, because the cost of
  // being wrong here is the whole deployment rather than one bad verdict.
  const { text: output_ } = boundInput(output);
  output = output_;
  const spans: EvidenceSpan[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(output)) && spans.length < limit && guard++ < 10_000) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    spans.push({ start: m.index, end: m.index + m[0].length, quote: m[0] });
  }
  return spans;
}

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/gu;

/**
 * Fences alternate open/close, so only every other one carries a language tag.
 * Counting all of them would report a phantom untagged block for every real one.
 */
export function openingFences(output: string): EvidenceSpan[] {
  const all = regexSpans(output, '^[ \\t]*```[a-zA-Z0-9+#_-]*', 'gm', 200) ?? [];
  return all
    .filter((_, i) => i % 2 === 0)
    .map((s) => {
      const lead = s.quote.length - s.quote.trimStart().length;
      return { start: s.start + lead, end: s.end, quote: s.quote.slice(lead) };
    });
}

export function wordCount(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** A piece of the output a length rule is measured over, with its offsets kept. */
export interface Segment {
  start: number;
  end: number;
  text: string;
}

/**
 * Cut the output into the units a rule named.
 *
 * Offsets are preserved so a violated segment can be quoted back as real evidence
 * instead of a bare number. Fenced code blocks are excluded from bullet, line and
 * sentence scopes — a code sample is not a bullet, and counting its words as if it were
 * turns "keep each bullet under 12 words" into a complaint about your code.
 */
export function segments(output: string, scope: LengthScope): Segment[] {
  if (scope === 'output') return [{ start: 0, end: output.length, text: output }];

  // Blank out fenced blocks so they neither form segments nor pad neighbouring ones,
  // while keeping every offset identical to the original string.
  let masked = output;
  const fence = /```[\s\S]*?(?:```|$)/g;
  masked = masked.replace(fence, (m) => ' '.repeat(m.length));

  const out: Segment[] = [];
  const push = (start: number, end: number) => {
    const raw = masked.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text.length) out.push({ start: start + lead, end: start + lead + text.length, text });
  };

  if (scope === 'line' || scope === 'bullet') {
    let at = 0;
    for (const line of masked.split('\n')) {
      const isBullet = /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line);
      if (scope === 'line' || isBullet) {
        // For a bullet, measure the content, not the marker.
        const off = scope === 'bullet' ? (/^\s*(?:[-*+]|\d+[.)])\s+/.exec(line)?.[0].length ?? 0) : 0;
        push(at + off, at + line.length);
      }
      at += line.length + 1;
    }
    return out;
  }

  if (scope === 'paragraph') {
    let at = 0;
    for (const para of masked.split(/\n\s*\n/)) {
      push(at, at + para.length);
      at += para.length + 2;
    }
    return out;
  }

  // Sentences. Deliberately crude and deliberately conservative: a split we are unsure
  // about produces a longer segment, which can only ever under-report a violation.
  const re = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) push(m.index, m.index + m[0].length);
  return out;
}

function scopeNoun(scope: LengthScope): string {
  return scope === 'output' ? 'the output' : scope;
}

/**
 * Cheap script/stopword-based language guess. Only used to check an explicit
 * "respond in <language>" rule, and only ever produces FOLLOWED/VIOLATED when
 * the signal is unambiguous — otherwise UNVERIFIABLE.
 */
export function guessLanguage(s: string): string | null {
  const t = s.toLowerCase();
  if (/[一-鿿]/.test(s)) return 'zh';
  if (/[぀-ヿ]/.test(s)) return 'ja';
  if (/[가-힯]/.test(s)) return 'ko';
  if (/[Ѐ-ӿ]/.test(s)) return 'ru';
  const hits = (re: RegExp) => (t.match(re) ?? []).length;
  const scores: Record<string, number> = {
    en: hits(/\b(the|and|of|to|is|that|with|for|this|are|you|it)\b/g),
    hu: hits(/\b(és|hogy|nem|egy|meg|van|azt|ez|de|már|csak|még|kell)\b/g),
    de: hits(/\b(und|der|die|das|nicht|ein|ist|zu|mit|für|auch|sich)\b/g),
    fr: hits(/\b(le|la|les|des|une|est|pour|dans|que|qui|avec|pas)\b/g),
    es: hits(/\b(el|la|los|las|una|es|para|con|que|por|como|más)\b/g),
    it: hits(/\b(il|lo|la|che|non|per|con|una|sono|come|più)\b/g),
    pt: hits(/\b(o|a|os|as|que|não|para|com|uma|mais|como)\b/g),
    nl: hits(/\b(de|het|een|niet|van|met|voor|dat|zijn|ook)\b/g),
    pl: hits(/\b(nie|się|jest|tego|dla|jak|który|oraz|może)\b/g),
    tr: hits(/\b(ve|bir|bu|için|ile|olarak|daha|gibi|çok)\b/g),
  };
  let best: string | null = null;
  let bestScore = 0;
  let second = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) {
      second = bestScore;
      bestScore = v;
      best = k;
    } else if (v > second) second = v;
  }
  // Require a clear win, otherwise admit we don't know.
  if (bestScore < 3 || bestScore < second * 1.6) return null;
  return best;
}

function refusalReason(pattern: string): string {
  const v = checkRegexSafety(pattern);
  return `This rule was not checked because ${v.reason ?? 'its pattern could not be run safely'}. Rewriting the pattern more simply will get it checked — we would rather tell you than report a pass we did not earn.`;
}

function parseJson(s: string): { ok: true } | { ok: false; error: string } {
  try {
    JSON.parse(s);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Find a JSON value embedded in prose: a fenced block first, then a balanced brace or
 * bracket run. Returns the span so the verdict can point at it rather than assert it.
 */
export function findJsonBlock(output: string): EvidenceSpan | null {
  const fence = /```(?:json|jsonc|json5)?[ \t]*\r?\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(output))) {
    const body = m[1];
    if (parseJson(body.trim()).ok) {
      const lead = body.length - body.trimStart().length;
      const start = m.index + m[0].indexOf(body) + lead;
      return { start, end: start + body.trim().length, quote: body.trim() };
    }
  }

  // Balanced scan, so we never hand JSON.parse a truncated slice.
  for (let i = 0; i < output.length; i++) {
    const open = output[i];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < output.length; j++) {
      const ch = output[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const slice = output.slice(i, j + 1);
          if (slice.length > 1 && parseJson(slice).ok) return { start: i, end: j + 1, quote: slice };
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Length rules, measured over the unit the rule named.
 *
 * A per-unit violation quotes the offending unit. A per-unit pass says how many units
 * were measured, because "0 bullets, therefore compliant" is not the same claim as
 * "9 bullets, all within the limit" and the difference matters to whoever reads it.
 */
function lengthCheck(
  rule: Rule,
  output: string,
  scope: LengthScope,
  dir: 'max' | 'min',
  n: number,
  measure: (s: string) => number,
  unit: string
): RuleResult {
  const segs = segments(output, scope);

  if (scope !== 'output' && segs.length === 0) {
    return res(
      rule,
      'NOT_APPLICABLE',
      `The output contains no ${scopeNoun(scope)}s, so a per-${scopeNoun(scope)} limit never applied.`,
      [],
      false
    );
  }

  const bad = segs
    .map((s) => ({ s, v: measure(s.text) }))
    .filter(({ v }) => (dir === 'max' ? v > n : v < n));

  const word = dir === 'max' ? 'limit' : 'minimum';

  if (bad.length === 0) {
    const worst = segs.reduce((acc, s) => {
      const v = measure(s.text);
      return dir === 'max' ? Math.max(acc, v) : Math.min(acc, v);
    }, dir === 'max' ? 0 : Number.POSITIVE_INFINITY);
    return res(
      rule,
      'FOLLOWED',
      scope === 'output'
        ? `${worst} ${unit} ${dir === 'max' ? '≤' : '≥'} ${word} of ${n}.`
        : `All ${segs.length} ${scopeNoun(scope)}s are within the ${word} of ${n} ${unit} (worst: ${worst}).`,
      [],
      true
    );
  }

  const evidence = bad.slice(0, 3).map(({ s }) => ({ start: s.start, end: s.end, quote: s.text }));
  const detail =
    scope === 'output'
      ? `${bad[0].v} ${unit} ${dir === 'max' ? 'exceeds' : 'is below'} the ${word} of ${n}.`
      : `${bad.length} of ${segs.length} ${scopeNoun(scope)}s ${dir === 'max' ? 'exceed' : 'fall below'} the ${word} of ${n} ${unit} (worst: ${
          dir === 'max' ? Math.max(...bad.map((b) => b.v)) : Math.min(...bad.map((b) => b.v))
        }).`;
  return res(rule, 'VIOLATED', detail, evidence, true);
}

function res(
  rule: Rule,
  verdict: RuleResult['verdict'],
  rationale: string,
  evidence: EvidenceSpan[],
  engaged: boolean
): RuleResult {
  return { ruleId: rule.id, verdict, method: 'deterministic', evidence, rationale, engaged };
}

/**
 * Layer A. Returns null when the rule has no deterministic checker — the caller
 * then routes it to the judge.
 *
 * Engagement semantics (this is what Coverage is built on):
 *  - A satisfied POSITIVE requirement is observable evidence the rule shaped the output.
 *  - A satisfied NEGATIVE requirement (nothing forbidden appeared) is NOT evidence of
 *    engagement unless the forbidden thing has a high natural base rate. We say so
 *    rather than pretending.
 */
export function runDeterministic(rule: Rule, output: string): RuleResult | null {
  const c = rule.check;

  switch (c.kind) {
    case 'forbidden_literal': {
      const hits = c.needles.flatMap((n) => findAll(output, n, c.caseSensitive));
      if (hits.length) {
        return res(rule, 'VIOLATED', `Forbidden text appears ${hits.length}× in the output.`, hits, true);
      }
      return res(
        rule,
        'FOLLOWED',
        `None of ${c.needles.map((n) => JSON.stringify(n)).join(', ')} appear in the output. Absence is proof of compliance, not proof the rule was read.`,
        [],
        false
      );
    }

    case 'required_literal': {
      const hits = c.needles.flatMap((n) => findAll(output, n, c.caseSensitive));
      if (hits.length) return res(rule, 'FOLLOWED', 'Required text is present.', hits, true);
      return res(rule, 'VIOLATED', 'Required text is absent from the output.', [], true);
    }

    case 'forbidden_regex': {
      const hits = regexSpans(output, c.pattern, c.flags);
      // A refused pattern must never read as a pass. "We did not run it" and "it did not
      // match" are different facts, and conflating them is the exact failure this product
      // exists to catch.
      if (hits === null) return res(rule, 'UNVERIFIABLE', refusalReason(c.pattern), [], false);
      if (hits.length) return res(rule, 'VIOLATED', `Forbidden pattern /${c.pattern}/ matched ${hits.length}×.`, hits, true);
      return res(rule, 'FOLLOWED', `Forbidden pattern /${c.pattern}/ never matches.`, [], false);
    }

    case 'required_regex': {
      const hits = regexSpans(output, c.pattern, c.flags);
      if (hits === null) return res(rule, 'UNVERIFIABLE', refusalReason(c.pattern), [], false);
      if (hits.length) return res(rule, 'FOLLOWED', `Required pattern /${c.pattern}/ matched.`, hits, true);
      return res(rule, 'VIOLATED', `Required pattern /${c.pattern}/ never matches.`, [], true);
    }

    case 'no_emoji': {
      const hits = regexSpans(output, EMOJI_RE.source, 'gu') ?? [];
      if (hits.length) return res(rule, 'VIOLATED', `${hits.length} emoji found.`, hits, true);
      return res(rule, 'FOLLOWED', 'No emoji in the output.', [], false);
    }

    case 'no_em_dash': {
      const hits = findAll(output, '—', true);
      if (hits.length) return res(rule, 'VIOLATED', `${hits.length} em dash(es) found.`, hits, true);
      // Em dashes have a high natural base rate in model output, so their absence
      // is meaningful engagement evidence.
      return res(rule, 'FOLLOWED', 'No em dashes. This has a high natural base rate, so absence is a real signal.', [], true);
    }

    case 'max_words':
      return lengthCheck(rule, output, c.scope, 'max', c.n, wordCount, 'words');

    case 'min_words':
      return lengthCheck(rule, output, c.scope, 'min', c.n, wordCount, 'words');

    case 'max_chars':
      return lengthCheck(rule, output, c.scope, 'max', c.n, (s) => s.length, 'characters');

    case 'format_json': {
      const whole = parseJson(output.trim());
      if (whole.ok) {
        return res(rule, 'FOLLOWED', 'The output parses as valid JSON.', [span(output, 0, Math.min(80, output.length))!].filter(Boolean), true);
      }

      // A JSON block inside an explanation satisfies "return it as JSON". It does not
      // satisfy "reply with nothing but JSON". Reporting the first as VIOLATED was a
      // false accusation against an answer that did exactly what was asked.
      const block = findJsonBlock(output);
      if (block) {
        if (!c.strict) {
          return res(rule, 'FOLLOWED', 'A valid JSON block is present in the output.', [block], true);
        }
        return res(
          rule,
          'VIOLATED',
          'A valid JSON block is present, but this rule asks for JSON and nothing else, and the output contains other text as well.',
          [block],
          true
        );
      }
      return res(rule, 'VIOLATED', `No valid JSON found in the output: ${whole.error}`, [], true);
    }

    case 'format_markdown_table': {
      const hits = regexSpans(output, '^\\|.*\\|\\s*$\\n\\|[\\s:|-]+\\|\\s*$', 'gm', 2) ?? [];
      return hits.length
        ? res(rule, 'FOLLOWED', 'A markdown table is present.', hits, true)
        : res(rule, 'VIOLATED', 'No markdown table found.', [], true);
    }

    case 'format_code_fence': {
      const hits = regexSpans(output, '```[\\s\\S]*?```', 'g', 3) ?? [];
      return hits.length
        ? res(rule, 'FOLLOWED', `${hits.length} fenced code block(s) present.`, hits, true)
        : res(rule, 'VIOLATED', 'No fenced code block found.', [], true);
    }

    case 'code_fence_language': {
      const opens = openingFences(output);
      if (!opens.length) return res(rule, 'NOT_APPLICABLE', 'No code blocks in this output, so the rule never applied.', [], false);
      const bad = opens.filter((s) => s.quote.slice(3).trim().toLowerCase() !== c.language.toLowerCase());
      return bad.length
        ? res(
            rule,
            'VIOLATED',
            `${bad.length} of ${opens.length} code block(s) not tagged "${c.language}".`,
            bad.slice(0, 3),
            true
          )
        : res(rule, 'FOLLOWED', `All ${opens.length} code block(s) tagged "${c.language}".`, opens.slice(0, 3), true);
    }

    case 'heading_required': {
      const hits = findAll(output, c.heading, false, 2);
      const headingHits = hits.filter((h) => /(^|\n)\s{0,3}#{1,6}\s*$/.test(output.slice(Math.max(0, h.start - 10), h.start)));
      if (headingHits.length) return res(rule, 'FOLLOWED', `Heading "${c.heading}" is present.`, headingHits, true);
      if (hits.length) return res(rule, 'UNVERIFIABLE', `"${c.heading}" appears in the text but not as a heading.`, hits, true);
      return res(rule, 'VIOLATED', `Required heading "${c.heading}" is missing.`, [], true);
    }

    case 'citation_required': {
      const links = regexSpans(output, '\\[[^\\]]{1,80}\\]\\((https?://[^)\\s]+)\\)|https?://[^\\s)\\]]+', 'g', 5) ?? [];
      return links.length
        ? res(rule, 'FOLLOWED', `${links.length} citation/link found.`, links, true)
        : res(rule, 'VIOLATED', 'No citations or links found in the output.', [], true);
    }

    case 'language': {
      const got = guessLanguage(output);
      if (!got) {
        return res(rule, 'UNVERIFIABLE', 'Output is too short or too mixed to identify a language with confidence.', [], false);
      }
      return got === c.code
        ? res(rule, 'FOLLOWED', `Detected language "${got}" matches the required ${c.name}.`, [], true)
        : res(rule, 'VIOLATED', `Detected language "${got}", but the rule requires ${c.name} (${c.code}).`, [], true);
    }

    default:
      return null;
  }
}
