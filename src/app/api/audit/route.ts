import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAudit } from '@/lib/audit';
import { persistAudit } from '@/lib/persist';
import { checkJudgeQuota } from '@/lib/quota';
import { getAccess } from '@/lib/entitlements';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RULESET = 120_000;
const MAX_OUTPUT = 200_000;

const Body = z.object({
  ruleset: z.string().min(1).max(MAX_RULESET),
  output: z.string().min(1).max(MAX_OUTPUT),
  artifact: z.string().max(120).optional(),
  deterministicOnly: z.boolean().optional(),
  previousDigest: z.string().max(64).nullable().optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', detail: parsed.error.flatten() }, { status: 400 });
  }

  const { ruleset, output, artifact, previousDigest } = parsed.data;
  // Without a key we can still run Layer A, and we say so instead of failing.
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const access = await getAccess();
  let deterministicOnly = parsed.data.deterministicOnly ?? !hasKey;

  // The judged layer on our key is a paid capability. Free still gets the deterministic
  // engine in full, which is four fifths of the verdicts and all of the reproducible ones.
  let gateNote: string | undefined;
  if (!deterministicOnly && !access.entitlements.hostedJudge) {
    deterministicOnly = true;
    gateNote =
      'Judged on our key is part of Builder. This ran deterministically — every verdict below is a reproducible proof.';
  }

  // The judged path spends our budget on behalf of whoever called this endpoint, so it is
  // metered even for subscribers. Exceeding the allowance degrades to a deterministic audit
  // rather than an error — the user still gets four fifths of the answer.
  let quotaNote: string | undefined;
  if (!deterministicOnly) {
    const quota = await checkJudgeQuota(req);
    if (!quota.allowed) {
      deterministicOnly = true;
      quotaNote = quota.reason;
    }
  }

  try {
    const { receipt, totalUsd, cost } = await runAudit({
      ruleset,
      output,
      artifact,
      previousDigest: previousDigest ?? null,
      deterministicOnly,
      // We are paying, so the price stays on our side of the wall.
      billing: 'host',
    });
    const mode = deterministicOnly ? ('deterministic' as const) : ('full' as const);
    // Storage is additive. A failure here must never break a completed audit.
    const stored = await persistAudit({ receipt, ruleset, output, mode, totalUsd, cost });

    return NextResponse.json(
      {
        receipt,
        judgeAvailable: hasKey && access.entitlements.hostedJudge,
        mode,
        stored,
        quotaNote,
        gateNote,
        plan: access.plan,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[enforcee] audit failed', err);
    return NextResponse.json({ error: 'Audit failed.' }, { status: 500 });
  }
}
