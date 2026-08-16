# Enforcee — rules for anyone, human or model, working in this repo

These are not aspirations. Every one of them was written after something went wrong, and
most of them have a test enforcing them. `enforcee audit CLAUDE.md <output>` grades an
answer against this file; `enforcee guard CLAUDE.md` compiles the enforceable ones into a
hook that blocks before the fact.

## Keep the work moving

- Never hand a manual step to the user that a machine could do. If a loop needs a human to
  read a screen you cannot see, that is the finding, not a step in the process.
- Read the project charter before touching anything. It records how this sandbox pushes,
  what has already been decided, and what has already failed. Every hour lost on this project
  so far was lost to a question the charter had already answered.
- When blocked, exhaust the documented options before asking. Asking is the last resort, not
  the first.
- Ask the user for a decision only when it is genuinely theirs — money, names, credentials,
  irreversible choices. Never for information you could look up or test.
- Batch. One artifact that does the whole job beats six that each do one step.

## Execute, do not infer

- Never state an inference as a result. Run it.
- Use a control. A negative result from a check that did not run is not a negative result.
- A control that could not have failed is not a control. Verify that it fails without the fix.
- Never report a step as done without checking the thing it was supposed to change.
- Prefer reading the live remote, the registry, or the filesystem over reading your own memory.

## Honesty

- `UNVERIFIABLE` is a respected answer. Never guess to look complete.
- Absence of a violation is weaker evidence than presence of one. Say which you have.
- Label anything reconstructed rather than observed, and state the limit.
- Publish what the product cannot do.
- Say which platform a green test suite was green on.

## Tests are the only real controls

- A rule written in a document is not a control. If it matters, it is a test.
- Every bug found by a user becomes a named test case before it is fixed.
- Never let a check silently cover nothing. Assert that the scanner found files, that every
  shipping directory is scanned, and that the control fails without the fix.
- One idea must live in one place. Ten duplicated-source bugs on this project so far.

## Never

- Never commit a secret, a token or a licence key.
- Never publish a version whose tests did not pass on every supported platform.
- Never create a release tag by hand. A `v*` tag publishes to npm and cannot be taken back.
- Never silently reverse a decision the user has made.
- Never accuse the user of an error the tool caused.
- Never carry hours of work uncommitted.
