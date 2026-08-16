# Releases

One section per published version. **The auto-release gate refuses to publish a version that
has no section here** (`.github/workflows/auto-release.yml`, condition 2), so this file is a
control rather than a courtesy: a release nobody can describe is a release nobody should get.

Write the section as part of the change that earns the version bump, not afterwards.

Format — the heading must match the version in `package.json`:

```
## vX.Y.Z

- What changed, in the words of someone who would be affected by it.
- Anything that needs a person to do something on upgrade.
```

The example above deliberately uses `vX.Y.Z` rather than a real-looking number. It used to say
`## v0.9.0`, and the gate greps this file for a heading matching the version being released —
so when the version actually reached 0.9.0, **the example alone would have satisfied the
gate** and shipped a release with no notes at all. Found 2026-08-16 while writing the 0.9.0
notes, by a duplicate heading appearing in the file. A sample that can be mistaken for the
thing it is a sample of is not a sample.

## v0.9.0

Two new commands, one behaviour change, and four fixes to things that were quietly wrong.

**`enforcee obstacles <dir>`** — reads your Claude Code session transcripts and reports the
walls this project has already hit, with a count and, where one has actually been observed to
work, a remedy. It reads only tool *results* — not your prompts, not your code — and strips
tokens, JWTs and URL credentials before writing anything.

Why it exists: measured over two real sessions of this project, 19% of tool results carried a
prerequisite failure, and **every recognised failure was a repeat of one already in the same
history**. The agent does not re-read its own history, so it walks into the same wall until a
person says "you keep doing this".

**`enforcee status`** — is it installed here, and what has it actually done? Reports absence as
loudly as presence: a project with hooks, a policy and a valid licence looks perfectly healthy
while the guard has never run once, and those two states are indistinguishable unless the empty
ledger is said out loud.

**The guard now carries what it has learned into each session.** On `SessionStart` and
`PostCompact` it appends the obstacles brief to the ruleset it already re-injects, and kicks off
an incremental refresh in the background — detached, so a session never waits on it. Rules go
first, so if the size cap bites it eats the advice rather than the contract.

**Fixes**

- `learn` was mining the assistant's own words. It read a `.jsonl` transcript as prose, so code
  and commit messages were proposed back to you as your preferences — including a regex from
  our own parser. It also has to exclude compaction summaries, which wear the user's role: in
  one real transcript, 93% of the "user" text was the assistant's own prose about its own work.
  The site said "only your words are read"; that is now true.
- A wrapped paragraph is one paragraph. Markdown hard-wraps, and the parser fed each physical
  line to the sentence splitter, so a sentence crossing a line break was never one sentence —
  26 rules from this repo's own docs were mid-sentence fragments, and two produced false
  VIOLATED verdicts against a document that breaks nothing.
- `citation_required` no longer rejects "src/app.ts line 12" and similar prose citations.
- Windows: a file URL is resolved with `fileURLToPath`, not `.pathname`, which yielded
  `/C:/Users/...`.

**Upgrading** — nothing to do. `obstacles` and `status` need no account, no key and no network,
like `audit`. The session brief only appears if you run the guard, which needs a licence.


Versions published before this file existed (up to and including `0.8.5`) are not recorded
here. They are not backfilled: notes reconstructed after the fact from a diff are a guess
about intent, and this project does not publish guesses as records. The npm registry and the
git tags remain the authoritative list of what shipped and when.
