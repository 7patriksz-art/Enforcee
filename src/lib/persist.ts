import type { Receipt } from './types';
import { getServerSupabase, getServiceSupabase } from './supabase/server';
import { hashText } from './receipt';

/**
 * Persist an audit, if and only if there is a signed-in user and a configured database.
 *
 * Deliberately non-fatal: a storage failure must never turn a successful audit into an
 * error page. The receipt the user is looking at is already sealed and correct; saving
 * it is a convenience, not part of the result.
 */
export async function persistAudit(params: {
  receipt: Receipt;
  ruleset: string;
  output: string;
  mode: 'deterministic' | 'full';
  totalUsd: number;
  rulesetName?: string;
}): Promise<{ saved: boolean; auditId?: string; reason?: string }> {
  const supabase = await getServerSupabase();
  if (!supabase) return { saved: false, reason: 'no database configured' };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { saved: false, reason: 'not signed in' };

  const { receipt, ruleset, output, mode, totalUsd } = params;

  try {
    const bodyHash = hashText(ruleset);

    // Content-addressed upsert, so the same ruleset across many audits is one row and
    // per-rule history has something stable to hang off.
    const { data: rs } = await supabase
      .from('rulesets')
      .upsert(
        {
          user_id: user.id,
          name: params.rulesetName ?? 'Untitled ruleset',
          artifact: receipt.rules[0]?.source.artifact ?? 'ruleset',
          body: ruleset,
          body_hash: bodyHash,
          rule_count: receipt.rules.length,
        },
        { onConflict: 'user_id,body_hash' }
      )
      .select('id')
      .single();

    const { data: audit, error: auditErr } = await supabase
      .from('audits')
      .insert({
        user_id: user.id,
        ruleset_id: rs?.id ?? null,
        digest: receipt.digest,
        previous_digest: receipt.previousDigest,
        ruleset_hash: receipt.rulesetHash,
        output_hash: receipt.outputHash,
        mode,
        engine: receipt.engine,
        summary: receipt.summary,
        receipt,
        output_text: output.slice(0, 200_000),
        total_usd: totalUsd,
      })
      .select('id')
      .single();

    if (auditErr || !audit) return { saved: false, reason: auditErr?.message ?? 'insert failed' };

    const byId = new Map(receipt.rules.map((r) => [r.id, r]));
    const rows = receipt.results.map((r) => ({
      audit_id: audit.id,
      user_id: user.id,
      rule_id: r.ruleId,
      rule_text: byId.get(r.ruleId)?.text ?? '',
      verdict: r.verdict,
      method: r.method,
      engaged: r.engaged,
      agreement: r.agreement ?? null,
      downgraded: Boolean(r.downgraded),
    }));
    if (rows.length) await supabase.from('rule_results').insert(rows);

    // The ledger is written with the service role so it cannot be rewritten from a browser.
    const service = getServiceSupabase();
    if (service && receipt.cost.length) {
      await service.from('cost_ledger').insert(
        receipt.cost.map((c) => ({
          user_id: user.id,
          audit_id: audit.id,
          model: c.model,
          input_tokens: c.inputTokens,
          output_tokens: c.outputTokens,
          cache_read_tokens: c.cacheReadTokens ?? 0,
          cache_write_tokens: c.cacheWriteTokens ?? 0,
          usd: c.usd,
          purpose: c.purpose,
        }))
      );
    }

    return { saved: true, auditId: audit.id };
  } catch (e) {
    console.error('[enforcio] persist failed', e);
    return { saved: false, reason: 'storage error' };
  }
}

/** The last N audits for the signed-in user, newest first. */
export async function recentAudits(limit = 40) {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('audits')
    .select('id, digest, mode, summary, total_usd, created_at, rulesets(name, rule_count)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * Per-rule track record — the thing no competitor's data model can express.
 * "Rule a3f9 has failed 6 of your last 40 audits."
 */
export async function ruleHistory(limit = 400) {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('rule_results')
    .select('rule_id, rule_text, verdict, engaged, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!data) return [];

  const byRule = new Map<
    string,
    { ruleId: string; text: string; total: number; followed: number; violated: number; unverifiable: number; noSignal: number; last: string }
  >();

  for (const r of data) {
    const e =
      byRule.get(r.rule_id) ??
      { ruleId: r.rule_id, text: r.rule_text, total: 0, followed: 0, violated: 0, unverifiable: 0, noSignal: 0, last: r.created_at };
    e.total++;
    if (r.verdict === 'FOLLOWED') e.followed++;
    else if (r.verdict === 'VIOLATED') e.violated++;
    else if (r.verdict === 'UNVERIFIABLE') e.unverifiable++;
    if (!r.engaged && r.verdict !== 'NOT_APPLICABLE') e.noSignal++;
    byRule.set(r.rule_id, e);
  }

  return [...byRule.values()].sort((a, b) => b.violated + b.noSignal - (a.violated + a.noSignal));
}
