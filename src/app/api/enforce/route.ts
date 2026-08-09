import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseRuleset } from '@/lib/rules/parse';
import { compilePolicy, proposeDenyRules, type DenyRule } from '@/lib/enforce/policy';
import { installScript } from '@/lib/enforce/bundle';
import { getAccess } from '@/lib/entitlements';

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

  // Seeing what would be blocked is free — it is the diagnosis, and it is what convinces
  // anyone that this is worth having. Compiling the thing that actually blocks is not.
  const access = await getAccess();

  if (!chosen) {
    // The preview shows WHAT would be blocked and WHY. It does not ship the compiled
    // pattern, because `pattern` + `flags` + `tool` is the entire policy file — handing
    // those to an anonymous caller made the paid guard free to anyone who read the
    // network tab. Free still sees every rule, its severity and its basis, which is what
    // makes the case; it just does not get the artefact.
    const preview = access.entitlements.guard
      ? proposals
      : proposals.map(({ pattern, flags, ...rest }) => ({
          ...rest,
          // Enough shape to be legible, not enough to reconstruct.
          patternPreview: `${pattern.slice(0, 18)}${pattern.length > 18 ? '…' : ''}`,
        }));

    return NextResponse.json(
      {
        proposals: preview,
        ruleCount: rules.length,
        canInstall: access.entitlements.guard,
        plan: access.plan,
        signedIn: access.signedIn,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!access.entitlements.guard) {
    return NextResponse.json(
      {
        error: 'The guard is part of Builder.',
        detail:
          'Everything above is real and yours to read — those are the commands that would have been stopped. Installing the thing that stops them is the paid part; reading this was not, and will not become so.',
        upgrade: '/pricing',
      },
      { status: 402, headers: { 'Cache-Control': 'no-store' } }
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
      'Content-Disposition': 'attachment; filename="enforcee-install.sh"',
      'Cache-Control': 'no-store',
    },
  });
}
