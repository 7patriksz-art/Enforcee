import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseRuleset } from '@/lib/rules/parse';
import { compilePolicy, proposeDenyRules, type DenyRule } from '@/lib/enforce/policy';
import { installScript } from '@/lib/enforce/bundle';

export const runtime = 'nodejs';

const Body = z.object({
  ruleset: z.string().min(1).max(120_000),
  /** Absent on the first call: return proposals. Present: compile the bundle. */
  chosen: z.array(z.string()).optional(),
  merge: z.boolean().optional(),
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

  const { ruleset, chosen, merge } = parsed.data;
  const { rules } = parseRuleset(ruleset);
  const proposals = proposeDenyRules(rules);

  if (!chosen) {
    return NextResponse.json(
      { proposals, ruleCount: rules.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const picked = new Set(chosen);
  const strip = (p: (typeof proposals)[number]): DenyRule => ({
    id: p.id,
    rule: p.rule,
    tool: p.tool,
    pattern: p.pattern,
    flags: p.flags,
    reason: p.reason,
  });

  const on = proposals.filter((p) => picked.has(p.id));
  const policy = compilePolicy(
    ruleset,
    rules,
    on.filter((p) => p.severity === 'deny').map(strip),
    on.filter((p) => p.severity === 'warn').map(strip)
  );

  return new NextResponse(installScript(policy, { merge: merge ?? true }), {
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="enforcio-install.sh"',
      'Cache-Control': 'no-store',
    },
  });
}
