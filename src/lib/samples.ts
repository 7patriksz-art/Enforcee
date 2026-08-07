export interface Sample {
  id: string;
  name: string;
  blurb: string;
  ruleset: string;
  output: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'claude-md',
    name: 'A CLAUDE.md that got ignored',
    blurb: 'The classic: a long rules file, an answer that quietly skipped half of it.',
    ruleset: `# Project rules

## Writing
- Never use emojis.
- Never use em-dashes.
- Never use the word delve.
- Keep every answer under 120 words.
- Always end with the line "Signed-off".

## Format
- Use a markdown table when comparing options.
- Code blocks must be tagged python.
- Always cite sources with links.

## Behaviour
- Be helpful.
- When the user asks about pricing, always state that figures are estimates.
`,
    output: `Sure — let's delve into the options 🚀

Postgres and MySQL both work here. Postgres has stronger JSON support and better extension story; MySQL is a bit simpler to operate and has wider shared-hosting support. For your use case I'd lean Postgres, mostly because you already store semi-structured event payloads and you'll want jsonb indexing sooner than you think.

Here's a starting point:

\`\`\`js
const db = connect(process.env.DATABASE_URL)
\`\`\`

Pricing is roughly $25/month on a managed plan.`,
  },
  {
    id: 'clean',
    name: 'The same rules, obeyed',
    blurb: 'What a compliant answer looks like — and how much of it we can actually prove.',
    ruleset: `# Project rules

## Writing
- Never use emojis.
- Never use em-dashes.
- Never use the word delve.
- Keep every answer under 120 words.
- Always end with the line "Signed-off".

## Format
- Use a markdown table when comparing options.
- Code blocks must be tagged python.
- Always cite sources with links.

## Behaviour
- Be helpful.
- When the user asks about pricing, always state that figures are estimates.
`,
    output: `| Option | Strength | Watch out for |
| --- | --- | --- |
| Postgres | jsonb indexing, extensions | heavier to operate |
| MySQL | simple ops, wide hosting | weaker JSON support |

Given you already store semi-structured event payloads, Postgres is the better fit.

\`\`\`python
db = connect(os.environ["DATABASE_URL"])
\`\`\`

Managed plans start around $25 per month. These figures are estimates.

Source: [Postgres docs](https://www.postgresql.org/docs/current/datatype-json.html)

Signed-off`,
  },
  {
    id: 'contradictions',
    name: 'A ruleset fighting itself',
    blurb: 'Runs with zero model calls. Finds duplicates, contradictions and rules nobody could ever check.',
    ruleset: `# Assistant configuration

## Tone
- Always use emojis to keep things friendly.
- Never use emojis.
- Be helpful.
- Use good judgment.

## Length
- Keep every answer under 100 words.
- Keep every answer under 100 words.
- Always give thorough, complete explanations with full background.

## Output
- Respond in valid JSON.
- Always cite sources with links.
`,
    output: `Happy to help! Here is a quick overview of what you asked about.`,
  },
];

export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
