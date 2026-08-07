import type { EvidenceSpan, Rule, RuleResult } from '../types';

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

function regexSpans(output: string, pattern: string, flags: string, limit = 5): EvidenceSpan[] {
  const f = flags.includes('g') ? flags : flags + 'g';
  let re: RegExp;
  try {
    re = new RegExp(pattern, f);
  } catch {
    return [];
  }
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
  const all = regexSpans(output, '^[ \\t]*```[a-zA-Z0-9+#_-]*', 'gm', 200);
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
      if (hits.length) return res(rule, 'VIOLATED', `Forbidden pattern /${c.pattern}/ matched ${hits.length}×.`, hits, true);
      return res(rule, 'FOLLOWED', `Forbidden pattern /${c.pattern}/ never matches.`, [], false);
    }

    case 'required_regex': {
      const hits = regexSpans(output, c.pattern, c.flags);
      if (hits.length) return res(rule, 'FOLLOWED', `Required pattern /${c.pattern}/ matched.`, hits, true);
      return res(rule, 'VIOLATED', `Required pattern /${c.pattern}/ never matches.`, [], true);
    }

    case 'no_emoji': {
      const hits = regexSpans(output, EMOJI_RE.source, 'gu');
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

    case 'max_words': {
      const n = wordCount(output);
      return n <= c.n
        ? res(rule, 'FOLLOWED', `${n} words ≤ limit of ${c.n}.`, [], true)
        : res(rule, 'VIOLATED', `${n} words exceeds the limit of ${c.n}.`, [], true);
    }

    case 'min_words': {
      const n = wordCount(output);
      return n >= c.n
        ? res(rule, 'FOLLOWED', `${n} words ≥ minimum of ${c.n}.`, [], true)
        : res(rule, 'VIOLATED', `${n} words is below the minimum of ${c.n}.`, [], true);
    }

    case 'max_chars': {
      const n = output.length;
      return n <= c.n
        ? res(rule, 'FOLLOWED', `${n} characters ≤ limit of ${c.n}.`, [], true)
        : res(rule, 'VIOLATED', `${n} characters exceeds the limit of ${c.n}.`, [], true);
    }

    case 'format_json': {
      const trimmed = output.trim();
      const fenced = /^```(?:json)?\s*([\s\S]*?)```$/.exec(trimmed);
      const candidate = fenced ? fenced[1].trim() : trimmed;
      try {
        JSON.parse(candidate);
        return res(rule, 'FOLLOWED', 'Output parses as valid JSON.', [span(output, 0, Math.min(80, output.length))!].filter(Boolean), true);
      } catch (e) {
        return res(rule, 'VIOLATED', `Output is not valid JSON: ${(e as Error).message}`, [], true);
      }
    }

    case 'format_markdown_table': {
      const hits = regexSpans(output, '^\\|.*\\|\\s*$\\n\\|[\\s:|-]+\\|\\s*$', 'gm', 2);
      return hits.length
        ? res(rule, 'FOLLOWED', 'A markdown table is present.', hits, true)
        : res(rule, 'VIOLATED', 'No markdown table found.', [], true);
    }

    case 'format_code_fence': {
      const hits = regexSpans(output, '```[\\s\\S]*?```', 'g', 3);
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
      const links = regexSpans(output, '\\[[^\\]]{1,80}\\]\\((https?://[^)\\s]+)\\)|https?://[^\\s)\\]]+', 'g', 5);
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
