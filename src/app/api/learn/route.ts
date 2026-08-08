import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractPreferences, toRulesetMarkdown, type Strength } from '@/lib/preferences';
import { parseRuleset } from '@/lib/rules/parse';
import { getAccess } from '@/lib/entitlements';

export const runtime = 'nodejs';

const Body = z.object({
  conversation: z.string().min(1).max(400_000),
  existingRuleset: z.string().max(120_000).optional(),
  minStrength: z.enum(['weak', 'medium', 'strong']).optional(),
  /** When present, return markdown for just these candidate ids. */
  accept: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const { conversation, existingRuleset, minStrength, accept } = parsed.data;
  const existingRuleIds = new Set(
    existingRuleset ? parseRuleset(existingRuleset).rules.map((r) => r.id) : []
  );

  const all = extractPreferences(conversation, {
    existingRuleIds,
    minStrength: (minStrength as Strength) ?? 'medium',
  });

  // Free sees the first few and is told exactly how many it is not seeing. A limit you
  // hide is a limit that produces a refund; a limit you name is a reason to upgrade.
  const { entitlements, plan } = await getAccess();
  const limit = entitlements.learnLimit;
  const capped = Number.isFinite(limit) ? all.slice(0, limit) : all;
  const withheld = all.length - capped.length;

  if (accept) {
    const picked = new Set(accept);
    // Gate the export too, not just the view — otherwise the wall is decoration.
    return NextResponse.json({
      markdown: toRulesetMarkdown(capped.filter((c) => picked.has(c.id))),
      withheld,
    });
  }

  return NextResponse.json(
    { candidates: capped, scanned: conversation.length, withheld, limit: Number.isFinite(limit) ? limit : null, plan },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
