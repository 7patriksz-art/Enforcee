# The licence keypair — where it lives, how to read it, how to rotate it

Referenced by `scripts/issue-repo-licence.mjs` when it cannot find a private key. If you
arrived here from that message, start at "Can you still read it?".

## The shape of it

One Ed25519 pair.

| Half | Lives in | Committed? |
|---|---|---|
| Public | `src/lib/licence-key.ts` **and** embedded in `guard/guard.mjs` | Yes, on purpose |
| Private | `ENFORCEE_LICENCE_PRIVATE_KEY` in the Vercel project environment | Never |

The public half is committed because it compiles into the published CLI — that is what lets a
licence verify on a laptop with no network, which is the entire design. It is in **two** files
and `tests/licence-key-sync.test.ts` fails if they diverge; changing one and not the other
produces a build where the CLI accepts a licence and the guard rejects it, or the reverse.

## Can you still read it?

Try, in the repo:

```
vercel env run -e production -- npm run licence:repo
```

This injects the variable into one command. It writes nothing to disk, needs no copy-paste,
and behaves identically on Windows, macOS and Linux.

**If it prints a licence, you are done** — that is the whole procedure.

**If it reports the variable is missing or empty, the key may be unrecoverable.** Vercel
defaults new production and preview variables to `sensitive`, and its documentation is
explicit that sensitive values *"are stored securely by Vercel and cannot be viewed later in
the dashboard or with `vercel env ls`"*. A sensitive variable is readable by the build and at
runtime and by nobody else, including you. Check with `vercel env ls` — if the row exists but
no value can be retrieved, it is sensitive, and no amount of dashboard clicking will produce
it. Go to rotation.

Do not conclude "it is gone" from a failed `vercel env pull` alone: `pull` defaults to the
**development** environment, and the key is likely only set for production. Pass
`-e production` before deciding.

## Rotation — when the private key is lost, leaked, or you simply want a new one

This is a release, not a config change, because the public half ships inside the CLI. Every
licence signed by the old key stops verifying the moment a user upgrades.

1. Generate a pair. `generateLicenceKeypair()` in `src/lib/licence.ts` exists for exactly this
   and is never called at runtime.
2. Put the **public** half in `src/lib/licence-key.ts` **and** in the `-----BEGIN PUBLIC KEY-----`
   block in `guard/guard.mjs`. Run `npx vitest run tests/licence-key-sync.test.ts` — it fails
   if you updated one and forgot the other, which is the mistake this step exists to catch.
3. Put the **private** half in Vercel as `ENFORCEE_LICENCE_PRIVATE_KEY`, production. Consider
   `--no-sensitive` if you want to be able to read it back later; that is a real trade — a
   readable secret against a recoverable one — and it is Patrik's call, not a run's.
4. Ship a CLI release. Until a user upgrades, their client still holds the old public key.
5. Re-issue outstanding licences. `POST /api/licence` does this for subscribers on request;
   `npm run licence:repo` does it for this repository.

**There is no revocation list and there never will be** — a licence is checked offline against
a compiled-in key on a machine that may never reach the network. The expiry date is the only
control that exists, which is why licences are capped at 45 days (D-022) and why this repo's
own licence is not exempt from that cap.

## Installing a licence, once you have one

```
node cli/dist/enforcee.mjs licence set "<the line the script printed>"
```

The same command on every platform. It verifies the licence before writing it, and absorbs the
BOM, CRLF and wrapping quotes a real shell leaves behind. There is deliberately no documented
`mkdir`-and-redirect alternative: that instruction was bash-only, it broke the paid tier's
first step on Windows, and it failed *looking like a bad licence rather than a bad
instruction*. `tests/invariants.test.ts` (E-6) now fails the build if one reappears.

For CI, set the licence as the `ENFORCEE_LICENCE` repository secret instead. `.enforcee/` is
gitignored, so a licence cannot be committed to this public repo by accident.
