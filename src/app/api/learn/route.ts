import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractPreferences, toRulesetMarkdown, type Strength } from '@/lib/preferences';
import { parseRuleset } from '@/lib/rules/parse';

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

  const candidates = extractPreferences(conversation, {
    existingRuleIds,
    minStrength: (minStrength as Strength) ?? 'medium',
  });

  if (accept) {
    const picked = new Set(accept);
    return NextResponse.json({
      markdown: toRulesetMarkdown(candidates.filter((c) => picked.has(c.id))),
    });
  }

  return NextResponse.json(
    { candidates, scanned: conversation.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
