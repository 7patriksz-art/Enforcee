# Read every session on your machine — including Screenkraft

**One command. Nothing leaves your disk except a summary you read first.**

I could not reach your sessions from here. Your desktop is connected, but `~/.claude` cannot
be granted to a cloud session — the picker on your device is the only route, and even then I
would be reading gigabytes of transcript through a straw.

So: run it where the files already are. That is also what our own privacy copy promises —
*"the command line makes no network call at all"* — and this is the first time we have taken
our own advice.

---

## The command

Open **PowerShell** and paste this whole block:

```powershell
cd $env:USERPROFILE\Enforcee
git pull
npm ci
npm run build:cli
node cli\dist\enforcee.mjs obstacles $env:USERPROFILE\.claude\projects
```

That prints a table, and writes two files into `Enforcee\.enforcee\`:

| file | what it is |
|---|---|
| `obstacles.md` | the short brief — **this is the one to send me** |
| `obstacles.json` | the full data, if you want to look |

**Send me `Enforcee\.enforcee\obstacles.md`.** Drag it into the chat.

---

## What it reads, and what it does not

It walks `~/.claude/projects` for `*.jsonl` — every Claude Code session on the machine, every
project, Screenkraft included. It reads **only the tool results**: the output of commands that
ran. Not your code, not your prompts, not my replies.

From those it keeps one line per *kind of wall you hit*, with a count. `egress blocks
api.supabase.com — hit 18×`. It does not keep the sessions, the commands, or the order.

**Secrets are stripped before anything is written.** `github_pat_…`, `sbp_…`, `sk-…`, JWTs,
`https://user:password@host`, and `Authorization:` headers are replaced with `<redacted>`.
Five test cases cover it and all five were watched failing with the redaction removed —
because a failure message is exactly where a token turns up, and this file is one you are
about to hand to someone.

Open `obstacles.md` before you send it. It is short on purpose. If anything in it looks like
something you would not put in a public issue, tell me and I will fix the redactor rather than
ask you to edit the file.

---

## If something goes wrong

**`git pull` asks for credentials** — you are on a private machine, so this is normal the first
time. Any method is fine; nothing about it matters to this task.

**`npm ci` fails** — try `npm install` instead. If Node is missing entirely, this needs Node 20+.

**`No .jsonl transcripts found under that path`** — the sessions are somewhere else. Run
`dir $env:USERPROFILE\.claude` and send me what it prints.

**It finds far fewer sessions than you expect** — Claude Code prunes old transcripts. Whatever
it finds is what still exists; the tool will tell you how many it read.

---

## Why this is worth five minutes

Run over *my* sessions on the build machine — 50 sessions, 2,829 tool results — it produced,
with nobody pointing at anything:

```
66×  HTTP 401 — the credential was rejected
27×  the proxy refuses CONNECT
18×  egress blocks api.supabase.com
 4×  git has no stored credential for https://github.com
```

Every one of those is a wall I walked into repeatedly, in sessions where the answer was already
written down somewhere I did not re-read. Across two transcripts measured precisely, **48 of 48
recognised failures were a signature already seen in the same history.** One hundred percent.

Your sessions will show a different list, and that list is the actual specification for what
Enforcee should be preventing — written by what really happened to you, rather than by either
of us guessing.
