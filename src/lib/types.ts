/**
 * Enforcee core types.
 *
 * Design rule: every verdict must carry HOW it was reached. We never blur the line
 * between a deterministic proof and a model's opinion.
 */

/** How a verdict was produced. Shown as a badge on every row in the UI. */
export type Method =
  | 'deterministic' // machine-checked, reproducible, no model involved
  | 'judged' // model-adjudicated, evidence-span verified against the output
  | 'structural'; // derived from the ruleset itself (no output needed)

export type Verdict =
  | 'FOLLOWED'
  | 'VIOLATED'
  | 'NOT_APPLICABLE' // the rule's trigger condition never fired for this output
  | 'UNVERIFIABLE'; // no observable signal either way — the honest bucket

/** The kinds of rule our deterministic layer can prove without a model. */
export type CheckKind =
  | 'forbidden_literal'
  | 'required_literal'
  | 'forbidden_regex'
  | 'required_regex'
  | 'no_emoji'
  | 'no_em_dash'
  | 'max_words'
  | 'min_words'
  | 'max_chars'
  | 'format_json'
  | 'format_markdown_table'
  | 'format_code_fence'
  | 'code_fence_language'
  | 'code_fence_tagged'
  | 'heading_required'
  | 'citation_required'
  | 'language'
  | 'judged'; // falls through to Layer B

export interface RuleSource {
  /** 1-indexed line numbers in the original ruleset text. */
  startLine: number;
  endLine: number;
  /** Markdown heading path this rule sits under, e.g. ["Style", "Tone"]. */
  section: string[];
  /** Which supplied artifact this came from, e.g. "CLAUDE.md". */
  artifact: string;
}

export interface Rule {
  /** Stable content-addressed id: sha256 of the normalized rule text, first 12 hex. */
  id: string;
  /** The rule as written, verbatim. */
  text: string;
  /** Lowercased, whitespace-collapsed, punctuation-trimmed. Used for the id + dedupe. */
  normalized: string;
  source: RuleSource;
  /** Deterministic classification. */
  check: CheckSpec;
  /** Conditional scope, e.g. "when writing code". Empty means always applicable. */
  trigger: string | null;
  /**
   * Approximate position in the context window, as a fraction (0 = very top).
   * Feeds the "buried rule" health warning.
   */
  position: number;
  /** Rough token cost of the rule text. */
  tokens: number;
}

/**
 * What a length limit is measured over.
 *
 * "Keep each bullet under 12 words" and "Keep the answer under 12 words" are different
 * rules, and measuring the first over the whole output produces a VIOLATED badged
 * "proven by code" against an answer that obeyed it perfectly. The scope is parsed from
 * the rule and carried here so the checker measures the thing the rule named.
 */
export type LengthScope =
  | 'output'
  | 'bullet'
  | 'line'
  | 'sentence'
  | 'paragraph'
  /**
   * The rule limits something that is not the audited text at all — a commit message, a PR
   * title, a filename. Measuring the answer instead reported a 154-character reply as
   * breaking a 72-character commit-message limit. `elsewhere` resolves to UNVERIFIABLE with
   * the reason said out loud, which is the only honest verdict available.
   */
  | 'elsewhere';

export type CheckSpec =
  | { kind: 'forbidden_literal'; needles: string[]; caseSensitive: boolean }
  | { kind: 'required_literal'; needles: string[]; caseSensitive: boolean }
  | { kind: 'forbidden_regex'; pattern: string; flags: string }
  | { kind: 'required_regex'; pattern: string; flags: string }
  | { kind: 'no_emoji' }
  | { kind: 'no_em_dash' }
  | { kind: 'max_words'; n: number; scope: LengthScope }
  | { kind: 'min_words'; n: number; scope: LengthScope }
  | { kind: 'max_chars'; n: number; scope: LengthScope }
  | { kind: 'format_json'; strict: boolean }
  | { kind: 'format_markdown_table' }
  | { kind: 'format_code_fence' }
  | { kind: 'code_fence_language'; language: string }
  /** Every opening fence must carry SOME language tag — the rule names no specific one. */
  | { kind: 'code_fence_tagged' }
  | { kind: 'heading_required'; heading: string }
  | { kind: 'citation_required' }
  | { kind: 'language'; code: string; name: string }
  /**
   * The rule asks whether an ACTION happened — run the tests, escalate, obtain approval.
   * No reading of a text output settles it, by us or by anyone, so it is never sent to the
   * judge and never guessed at. It resolves to UNVERIFIABLE with a pointer to the layer that
   * CAN answer it, which reads the environment rather than the answer.
   */
  | { kind: 'action'; hint: string }
  | { kind: 'judged'; reason: string };

/** A literal span of the audited output that supports a verdict. */
export interface EvidenceSpan {
  /** Character offsets into the output text. */
  start: number;
  end: number;
  /** The literal text at [start, end). Always verified to match. */
  quote: string;
}

export interface RuleResult {
  ruleId: string;
  verdict: Verdict;
  method: Method;
  /** Zero or more literal, offset-verified spans. Never model-invented text. */
  evidence: EvidenceSpan[];
  /** One-line, plain-language explanation. */
  rationale: string;
  /**
   * Did the output show any observable sign of this rule being applied?
   * This is what Coverage is computed from — the silent-loss signal.
   */
  engaged: boolean;
  /** For judged rules: agreement across independent samples, 0..1. */
  agreement?: number;
  /** Set when a judge returned a quote that was NOT found in the output. */
  downgraded?: boolean;
}

/** Deterministic ruleset critique — runs with no output and no model call. */
export interface HealthFinding {
  code:
    | 'duplicate'
    | 'near_duplicate'
    | 'contradiction'
    | 'unenforceable'
    | 'buried'
    | 'oversized'
    /** Too many rules to compare every pair; analysis was bounded and says so. */
    | 'ruleset_too_large'
    /** Pair analysis stopped early. Never let a cap read as a clean bill of health. */
    | 'pair_findings_truncated'
    /** Nothing was extracted at all — an empty audit is not a passing one. */
    | 'no_rules'
    /** Bullets the splitter declined. A dropped rule is never dropped quietly. */
    | 'lines_skipped';
  severity: 'info' | 'warn' | 'error';
  ruleIds: string[];
  message: string;
}

export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  usd: number;
  purpose: string;
}

export interface Receipt {
  version: '1';
  /** sha256 of the canonicalized ruleset text. */
  rulesetHash: string;
  /** sha256 of the audited output text. */
  outputHash: string;
  /** Version of every checker that contributed, so results are reproducible. */
  engine: { parser: string; deterministic: string; judge: string | null };
  createdAt: string;
  rules: Rule[];
  results: RuleResult[];
  health: HealthFinding[];
  summary: {
    total: number;
    followed: number;
    violated: number;
    notApplicable: number;
    unverifiable: number;
    /** engaged / applicable — the headline number. */
    coverage: number;
    /** How much of the verdict set needed no model at all. */
    deterministicShare: number;
  };
  cost: CostEntry[];
  /** sha256 over the canonical JSON of everything above. Tamper-evident. */
  digest: string;
  /** Digest of the previous receipt for this assistant, forming a chain. */
  previousDigest: string | null;
}
