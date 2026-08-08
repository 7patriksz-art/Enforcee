---
name: enforcee-audit
description: Audit whether an AI output followed a ruleset, rule by rule, with evidence. Use when the user asks whether their rules were followed, whether CLAUDE.md is being honoured, why the assistant ignored an instruction, to check compliance of a response against project rules, or to produce a receipt for a piece of work. Also use when the user wants to know which of their rules are dead, contradictory or too vague to check.
---

# Auditing rules with Enforcee

Enforcee answers one question: **which of these rules did the output actually follow, and where is the proof?**

## When to reach for it

- "Did you follow my CLAUDE.md?"
- "Why do you keep ignoring rule X?"
- "Check this answer against our style guide."
- "Which of my rules are actually doing anything?"

## How to run it

Everything runs locally and makes no network call unless `--judge` is passed.

```bash
# Audit an output against a ruleset. Exits non-zero if any rule was VIOLATED.
npx enforcee audit CLAUDE.md answer.md

# Critique the ruleset on its own — duplicates, contradictions, unenforceable rules.
npx enforcee health CLAUDE.md

# Propose rules from things the user already said in conversation.
npx enforcee learn conversation.txt CLAUDE.md

# Read a session transcript: skills offered vs used, MCP servers that never connected.
npx enforcee session ~/.claude/projects/<project>/<session>.jsonl
```

## Reading the output

Each rule gets one of four verdicts, and the method that produced it:

- `FOLLOWED` / `VIOLATED` — backed by an exact quote at a character offset.
- `NOT_APPLICABLE` — the rule's trigger never fired.
- `UNVERIFIABLE` — no observable signal either way. This is a respected answer, not a failure.

`proof` means code decided it and the result is reproducible. `judge` means a model decided it, and
its evidence quote was verified to exist literally in the output or the verdict was discarded.

**Coverage** is the headline number: the share of applicable rules that left any observable trace.
A rule that left none was probably never read.

## What to tell the user

Report the verdicts plainly. Never soften a `VIOLATED`, and never upgrade an `UNVERIFIABLE` into a
pass to look thorough — the whole value of the tool is that it does not do that.
