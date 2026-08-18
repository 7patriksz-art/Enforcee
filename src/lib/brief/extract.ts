/**
 * Turn a prompt into a checkable contract. Steps 1-3 of the loop.
 *
 * DETERMINISTIC ONLY. Everything here is a regex over the prompt text — no model call, no
 * network, no guessing. A prompt is the one input we always have, and reading it should not
 * cost anything or need a key.
 *
 * The honest limit, stated here rather than discovered later: this extracts what a prompt
 * SAYS. It cannot extract what a prompt MEANS. "Make it work" yields one requirement with no
 * derivable acceptance check, and the brief will say so rather than invent one — a pending
 * criterion is a visible hole, an invented one is a lie that passes.
 */
import { createHash } from 'node:crypto';
import type { Precondition } from '../prevent/preconditions';
import type { Acceptance, Brief, Requirement, RequirementKind } from './types';

const hash = (s: string, prefix: string) =>
  `${prefix}-${createHash('sha256').update(s).digest('hex').slice(0, 10)}`;

/** Lowercased, whitespace-collapsed, trailing punctuation trimmed — for stable ids. */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?;:,\s]+$/, '').trim();
}

/**
 * Sentences that ask for something.
 *
 * An imperative in English has no subject before its verb, and a request often wears a modal
 * ("must", "should", "needs to") or a direct address ("you should", "I want"). Both shapes
 * count. Questions count separately because answering one is also a deliverable.
 */
const ASK =
  /\b(must|should|need to|needs to|have to|has to|make sure|ensure|i want|i need|please|let'?s|lets|we should|we must|you should|you must)\b/i;
/**
 * Verbs that start a request.
 *
 * `re-?` is optional in front of every one of them: "rewrite the homepage copy" was silently
 * dropped by the first version because the list had `write` and the word was `rewrite`. A
 * fixed verb list is the honest limit of a no-model reader, and it WILL miss verbs — which is
 * why `brief` prints what it extracted, so a miss is visible to the person who wrote the
 * prompt rather than discovered three steps later.
 */
const IMPERATIVE_START =
  /^(?:re-?)?(add|build|make|create|write|fix|remove|delete|update|change|run|test|verify|check|publish|ship|deploy|install|set up|setup|wire|clean|refactor|rename|move|document|prove|find|audit|enforce|learn|plan|start|stop|continue|use|give|show|report|close|open|push|pull|merge|revert|send|generate|analyse|analyze|investigate|measure|record|track|sort|group|split|extract|replace|improve|simplify|shorten|expand|draft|design|sketch|review|compare|explain|summarise|summarize|list|count|scan|sweep|patch|bump|tag|release|rollback|restore|migrate|seed|backfill|monitor|watch|alert|notify)\b/i;
const CONSTRAINT = /\b(never|do not|don'?t|must not|no longer|avoid|without|instead of|rather than|stop)\b/i;

/** Lines that carry no request: headings, fences, blank lines, pure quotes. */
function isProse(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(#{1,6}\s|```|~~~|\||-{3,}|={3,})/.test(t)) return false;
  return true;
}

/**
 * Strip a leading list marker so "- Fix the build" reads as an imperative, and the discourse
 * markers people actually write in front of one.
 *
 * "Also rewrite the homepage copy" was dropped entirely by the first version, because
 * IMPERATIVE_START is anchored and the line begins with "Also". A prompt reader that only
 * sees requests phrased tidily is a reader tested on prompts written to please it — the mirror
 * pattern with a new face. People write "then", "now", "also", "finally", "and".
 */
const LEAD = /^(?:(?:also|then|now|next|first|firstly|second(?:ly)?|third(?:ly)?|finally|lastly|additionally|furthermore|meanwhile|afterwards?|after that|so|and|but|plus|please|kindly|maybe|perhaps|ideally)[,:]?\s+)+/i;

function body(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(LEAD, '')
    .trim();
}

export function extractRequirements(prompt: string): Requirement[] {
  const out: Requirement[] = [];
  const seen = new Set<string>();

  prompt.split('\n').forEach((line, i) => {
    if (!isProse(line)) return;
    // One line can carry several asks; split on sentence boundaries but keep it cheap.
    for (const raw of body(line).split(/(?<=[.!?])\s+(?=[A-Z"'`])/)) {
      const text = raw.trim();
      if (text.length < 8 || text.length > 400) continue;

      let kind: RequirementKind | null = null;
      if (/\?\s*$/.test(text)) kind = 'question';
      else if (CONSTRAINT.test(text)) kind = 'constraint';
      else if (IMPERATIVE_START.test(text) || ASK.test(text)) kind = 'do';
      if (!kind) continue;

      const key = normalise(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: hash(key, 'R'), text, kind, line: i + 1 });
    }
  });
  return out;
}

/**
 * Everything the work will need, read out of the prompt.
 *
 * Reuses the `Precondition` shape so `checkPrecondition` can probe these unchanged — one
 * prober, not two. E-1 (duplicated source) is at twelve instances on this project and a
 * second implementation of "does this binary exist" would be the thirteenth.
 */
const TOOL = /\b(npm|npx|node|git|gh|docker|vercel|supabase|python3?|pip3?|cargo|go|make|psql|curl)\b/g;
const ENV_VAR = /\$([A-Z][A-Z0-9_]{2,})\b|\b([A-Z][A-Z0-9_]{2,}_(?:KEY|TOKEN|SECRET|URL|ID|DSN))\b/g;
const PATH_LIKE = /\b((?:src|tests?|scripts?|docs?|cli|guard|public|app)\/[\w./-]+\.[a-z]{1,5})\b/g;

export function extractPreconditions(prompt: string): Precondition[] {
  const out: Precondition[] = [];
  const seen = new Set<string>();
  const add = (p: Precondition) => {
    const k = `${p.kind}:${p.target}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };

  for (const m of prompt.matchAll(TOOL)) {
    add({ kind: 'binary', target: m[1], why: `the prompt names ${m[1]}, so the run will need it` });
  }
  for (const m of prompt.matchAll(ENV_VAR)) {
    const name = m[1] ?? m[2];
    add({ kind: 'env', target: name, why: `the prompt names ${name}, and a missing key stops the run dead` });
  }
  for (const m of prompt.matchAll(PATH_LIKE)) {
    add({ kind: 'file', target: m[1], why: `the prompt names ${m[1]}` });
  }
  return out;
}

/**
 * Acceptance: how each requirement will be proved.
 *
 * A criterion is DERIVED only when the prompt itself names something runnable — a command in
 * backticks, or a well-known verb with an obvious probe. Everything else is `run: null`, which
 * the report shows as PENDING.
 *
 * That asymmetry is deliberate. An invented check passes and teaches nothing; a pending one is
 * a visible hole that somebody has to fill before `close` can go green. Guessing here would
 * reproduce, inside the tool, the exact failure the tool exists to stop.
 */
const BACKTICK_CMD = /`([^`\n]{3,120})`/g;
const RUNNABLE = /^(npm|npx|node|git|gh|make|cargo|go|python3?|pytest|vitest|jest|docker|vercel|supabase|curl)\b/;

export function proposeAcceptance(reqs: Requirement[], prompt: string): Acceptance[] {
  // Commands the prompt itself names, in order — the strongest available signal.
  const commands: string[] = [];
  for (const m of prompt.matchAll(BACKTICK_CMD)) {
    const c = m[1].trim();
    if (RUNNABLE.test(c) && !commands.includes(c)) commands.push(c);
  }

  return reqs
    .filter((r) => r.kind !== 'question')
    .map((r, i) => {
      // Pair a named command with a requirement only when the requirement mentions it, so a
      // command from an unrelated sentence is not silently adopted as proof of this one.
      const own = commands.find((c) => r.text.includes(c));
      const run = own ?? null;
      return {
        id: hash(`${r.id}:${run ?? 'pending'}:${i}`, 'A'),
        for: r.id,
        run,
        expect: '',
        why: run
          ? `the prompt names \`${run}\`, so running it settles this`
          : `no command in the prompt proves this — write one before close can pass`,
      };
    });
}

export function buildBrief(args: {
  prompt: string;
  createdAt: string;
  rules: string | null;
  preconditions?: Precondition[];
}): Brief {
  const requirements = extractRequirements(args.prompt);
  return {
    v: 1,
    id: hash(normalise(args.prompt), 'B'),
    prompt: args.prompt,
    createdAt: args.createdAt,
    requirements,
    preconditions: args.preconditions ?? extractPreconditions(args.prompt),
    acceptance: proposeAcceptance(requirements, args.prompt),
    blockers: [],
    rules: args.rules,
  };
}
