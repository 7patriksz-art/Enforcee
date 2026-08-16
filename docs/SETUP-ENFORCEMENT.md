# Turning enforcement on — click by click, from zero

Every step below has a **You should see** line. If what you see does not match, stop at that
step and jump to [When it goes wrong](#when-it-goes-wrong) — the point of those lines is that a
failure tells you *which* step broke instead of "it didn't work".

Nothing here differs between Windows, macOS and Linux unless a step says so.

Total: about five minutes, and you do it once.

---

## Part 0 — before you start

### 0.1 Open a terminal in a folder

You will need this twice. If you already know how, skip.

- **Windows:** open File Explorer, navigate to the folder, click the address bar at the top,
  type `powershell`, press Enter.
- **macOS:** open Terminal (Cmd+Space, type `Terminal`, Enter). Type `cd ` — with a space after
  it — then drag the folder from Finder onto the Terminal window and press Enter.
- **Linux:** right-click inside the folder → *Open in Terminal*.

### 0.2 Check Node is installed

Type:

```
node --version
```

**You should see** `v20.…` or higher, e.g. `v24.4.0`.

**If you see** `command not found` or `not recognized`: install Node from
<https://nodejs.org> (the LTS button), then close and reopen the terminal.

### 0.3 Check git is installed

```
git --version
```

**You should see** `git version 2.…`.

---

## Part 1 — get the seven commits onto `main`

### 1.1 Find the patch file

Claude sent you `enforcee-2026-08-16-SEVEN.patch`. It is in your Downloads folder unless you
moved it. Leave it there; step 1.3 uses the full path.

### 1.2 Open a terminal in your local copy of the repo

If you already have the repo cloned, open a terminal there (see 0.1) and run:

```
git checkout main
git pull
```

If you do **not** have it cloned, open a terminal anywhere you keep code and run:

```
git clone https://github.com/7patriksz-art/Enforcee.git
cd Enforcee
```

**You should see** `Cloning into 'Enforcee'...` and then a folder called `Enforcee`.

Confirm you are in the right place:

```
git log --oneline -1
```

**You should see** `70d1cc3 The project ref, from somewhere every environment can see`.

**If you see a different commit** the repo has moved on since this patch was cut. Stop and say
so — the patch may not apply cleanly and forcing it is how work gets lost.

### 1.3 Apply the patch

Windows PowerShell:

```
git am "$env:USERPROFILE\Downloads\enforcee-2026-08-16-SEVEN.patch"
```

macOS / Linux:

```
git am ~/Downloads/enforcee-2026-08-16-SEVEN.patch
```

**You should see** exactly seven lines beginning `Applying:`, the last one being
`Applying: The licence, and removing every step of it that could go wrong on one platform`.

**If you see** `error: patch failed` or the prompt shows `|AM`: run `git am --abort` to get back
to where you were, then use the bundle instead:

```
git pull ~/Downloads/enforcee-2026-08-16.bundle main
```

### 1.4 Check it before you push

```
npm ci
npx vitest run
```

`npm ci` takes a minute or two and prints a lot. **You should see**, at the end of the second
command:

```
 Test Files  47 passed (47)
      Tests  862 passed (862)
```

**If any test fails, do not push.** Say what failed.

### 1.5 Push

```
git push origin main
```

**You should see** a line like `70d1cc3..<something>  main -> main`.

Then confirm the remote really moved — never trust the push's own report:

```
git rev-parse main
git ls-remote origin refs/heads/main
```

**You should see** the same 40-character hash twice.

### 1.6 Confirm CI is green — do not skip this

Go to <https://github.com/7patriksz-art/Enforcee/actions>. The top run is yours.

**You should see**, after roughly five minutes, a green tick and **three** jobs passing:
`ubuntu-latest`, `windows-latest`, `macos-latest`.

Nine releases on this project once claimed "all tests pass" while the suite had only ever run
on Linux. Green on your machine is not green.

---

## Part 2 — turn enforcement on

### 2.0 You must be standing inside the Enforcee folder

**Part 2 does not work from anywhere else, and this is the step people skip.** `vercel link`
links whatever directory you are currently in, and `npm run licence:repo` only exists inside
this repo — and only after Part 1, which is what adds it.

Check where you are. The text before the `>` in PowerShell is your current folder:

```
PS C:\Users\7patr>            ← WRONG, this is your home folder
PS C:\Users\7patr\Enforcee>   ← right
```

If you are not in it, this gets you there and is safe to run whether or not you already
cloned it — the `if` skips the clone when the folder exists:

```
cd $env:USERPROFILE
if (-not (Test-Path Enforcee)) { git clone https://github.com/7patriksz-art/Enforcee.git }
cd Enforcee
```

macOS / Linux:

```
cd ~
[ -d Enforcee ] || git clone https://github.com/7patriksz-art/Enforcee.git
cd Enforcee
```

Now confirm Part 1 actually happened, because Part 2 depends on it:

```
npm run
```

**You should see** `licence:repo` and `dogfood` in the list of scripts.

**If you do not**, the patch is not applied — go back and do Part 1. Running Part 2 first gives
you `Missing script: "licence:repo"`.

### 2.1 Link the repo to Vercel (first time only)

```
npx vercel link
```

**Type `npx` — the leading `npx` is not optional.** Plain `vercel link` gives
`'vercel' is not recognized as the name of a cmdlet` on Windows, or `command not found`
elsewhere, because the Vercel CLI is not installed globally. `npx` fetches and runs it for
this command only, which is deliberate: nothing permanent is installed on your machine.

The first `npx vercel …` of the day asks `Ok to proceed? (y)` — answer `y`. It may also print
telemetry and deprecation notices. Both are normal and neither is an error.

It then asks a short series of questions. Answer: yes to set up, choose your scope/account,
**yes** to "Link to existing project", and pick `enforcee`.

**You should see** `✅  Linked to …/enforcee (created .vercel)`.

**If you see** a login prompt, it prints a URL like
`https://vercel.com/oauth/device?user_code=XXXX-XXXX`. Open it, approve, come back. It ends
with `> Success! Logged in.` — that is login done, **not** linking done. Run `npx vercel link`
again afterwards.

### 2.2 Sign and install the licence — one command

```
npx vercel env run -e production -- npm run licence:repo -- --install
```

This pulls the signing key straight into that one command. Nothing is written to disk, nothing
is copy-pasted, and the key never appears on your screen.

**You should see:**

```
Key read from ENFORCEE_LICENCE_PRIVATE_KEY.

Licence for enforcee-on-enforcee · founder · expires 2026-09-30 (45 days)
Verified against the public key the CLI compiles in.

eyJqdGki…                                    ← the licence, one long line
Installed to /…/Enforcee/.enforcee/licence
```

**Copy that long line now** — you need it once more in Part 3, and it is the only time it is
shown.

### 2.3 Confirm enforcement is actually on

```
npm run dogfood
```

**You should see** three lines, and the third is the one that matters:

```
CLAUDE.md → 26 rules parsed · 19 enforceable proposals · 12 deny + 1 repo-specific + 4 warn compiled.
Wrote .enforcee/policy.json — 13 blocking, 4 warning.
Licensed to enforcee-on-enforcee · founder · 45 days left — enforcement is ON.
```

If the third line says `No licence`, step 2.2 did not install. Go to
[When it goes wrong](#when-it-goes-wrong).

### 2.4 Watch it block something

This is the demonstration, and it takes ten seconds. Ask Claude Code, inside this repo, to run
`git tag v9.9.9`.

**You should see** it refused, with:

```
Blocked by Enforcee rule REPO-tag: Never create a release tag. A v* tag publishes to npm
and cannot be taken back.
```

That rule was in eleven scheduled job prompts as prose and enforced nowhere until now.

---

## Part 3 — the CI secret

So the release gate and CI can enforce too.

1. Go to <https://github.com/7patriksz-art/Enforcee/settings/secrets/actions>
2. Click the green **New repository secret** button, top right.
3. **Name:** `ENFORCEE_LICENCE`
4. **Secret:** paste the long line from step 2.2.
5. Click **Add secret**.

**You should see** `ENFORCEE_LICENCE` listed under *Repository secrets* with "Updated now".

---

## When it goes wrong

### "Your codebase isn't linked to a project on Vercel"

You are not standing in the Enforcee folder, or you have not linked it yet. Do step 2.0 and
then 2.1. Logging in is not linking — a successful `Success! Logged in.` still leaves the
folder unlinked.

### "'vercel' is not recognized as the name of a cmdlet" / "vercel: command not found"

You typed `vercel` instead of `npx vercel`. The CLI is not installed globally, on purpose.
Every Vercel command in this document starts with `npx`.

### `Missing script: "licence:repo"`

Part 1 has not been done in this folder, or you are in the wrong folder. See step 2.0.

### "No private key found"

The key was not injected. Check whether it exists at all:

```
npx vercel env ls
```

**If `ENFORCEE_LICENCE_PRIVATE_KEY` is not listed for Production**, it was never set. It has to
be created before anything here works — see `docs/LICENCE-KEY.md`.

**If it is listed but the value cannot be retrieved**, it was stored as *sensitive*. Vercel's
own documentation is explicit: *"Once you create one, its value can no longer be read back from
the dashboard or the CLI"* — sensitive values are *"readable only during a build"*. That means
the key is unrecoverable by anyone, including you, and the fix is a new keypair. `docs/LICENCE-KEY.md`
has that procedure. It is a CLI release, not a config change, because the public half compiles
into the published binary.

Do **not** conclude the key is gone from a failed `vercel env pull`: `pull` defaults to the
*development* environment and this key is likely only on production.

You can also look in the dashboard — open the project on vercel.com and go to **Environment
Variables**. Vercel's KB describes only those two levels of navigation, so I am not going to
invent a deeper click path for a screen I cannot see.

### "not a pair"

The private key in Vercel and the public key in the repo do not match. **Stop.** A licence
signed by the wrong key looks perfect and fails on every machine it is installed on. This
means the key was rotated on one side only. See `docs/LICENCE-KEY.md`.

### "is not a PEM private key" / "not a usable PKCS#8 Ed25519 private key"

The value arrived truncated or mangled. If you pasted it by hand, don't — use 2.2, which never
puts the key through a shell.

### "that licence did not verify — nothing was written"

The token was damaged in transit, and nothing was written, which is the point of verifying
first. Re-run 2.2.

### `npm ci` fails

Delete `node_modules` and try again. If it still fails, run `npm install` instead and say what
it printed.

---

## 45 days from now

This licence expires on purpose, capped at 45 days by D-022 exactly like a customer's. We do
not mint ourselves a longer one: an offline licence is checked against a compiled-in key on a
machine that may never reach the network, so there is no revocation list and the expiry date is
the only control that exists. Exempting ourselves would mean the code path customers live on is
the one path we never exercise.

So it will lapse, and the failure mode to avoid is enforcement switching off quietly one
morning. `npm run dogfood` prints the days remaining every time it runs and gets loud inside
the last week. When it does, repeat step 2.2 — one command.
