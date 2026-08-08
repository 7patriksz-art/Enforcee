import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAudit } from '@/lib/audit';
import { persistAudit } from '@/lib/persist';

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
  const deterministicOnly = parsed.data.deterministicOnly ?? !hasKey;

  try {
    const { receipt, totalUsd } = await runAudit({
      ruleset,
      output,
      artifact,
      previousDigest: previousDigest ?? null,
      deterministicOnly,
    });
    const mode = deterministicOnly ? ('deterministic' as const) : ('full' as const);
    // Storage is additive. A failure here must never break a completed audit.
    const stored = await persistAudit({ receipt, ruleset, output, mode, totalUsd });

    return NextResponse.json(
      { receipt, totalUsd, judgeAvailable: hasKey, mode, stored },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[enforcio] audit failed', err);
    return NextResponse.json({ error: 'Audit failed.' }, { status: 500 });
  }
}
