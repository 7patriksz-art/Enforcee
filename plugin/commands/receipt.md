---
description: Audit your last output against the project ruleset and print the receipt
---

Audit the most recent assistant output in this session against the project's ruleset.

1. Find the ruleset: `CLAUDE.md` in the project root, or `AGENTS.md`, or `.cursorrules`.
2. Write the last substantive assistant message to a temporary file.
3. Run `npx enforcee audit <ruleset> <tempfile>`.
4. Report the table verbatim, then say in one sentence which rule is the most worrying and why.

Do not editorialise the verdicts. If something came back `UNVERIFIABLE`, say so.
