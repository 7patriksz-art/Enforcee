#!/usr/bin/env bash
# Push, then RECONCILE THE TRACKING REF. Both halves, always.
#
# This sandbox has no stored git credential, so every push goes to an explicit URL carrying
# a PAT. That works — and it never updates `refs/remotes/origin/main`, because git only
# moves the tracking ref when you push to the *named remote*. So `git log origin/main..main`
# keeps reporting unpushed commits that are already on GitHub.
#
# It fired three times in one session. Each time the diagnosis was the same, the commits
# were already safe, and the minutes went on re-deriving it. Worse, it is indistinguishable
# from the real thing — "you have unpushed work" is exactly what you would see if the push
# had actually failed, so it cannot be ignored either.
#
# Enforcee's own `obstacles` scan already records this wall and its remedy:
#
#   git has no stored credential for https://github.com — hit 4x
#   Observed: push to an explicit URL with the PAT, then `git fetch origin` so the
#   tracking ref stops lying.
#
# Knowing the remedy and re-deriving it three times is the exact failure this project is
# built to stop. CLAUDE.md: "A rule written in a document is not a control." So it is a
# script, and the fetch cannot be forgotten because it is not a separate step.
#
#   PAT=github_pat_... ./scripts/push.sh [branch]
set -euo pipefail
BRANCH="${1:-main}"

# ── Do not push something that cannot build ──────────────────────────────────
#
# CI was red on all three platforms for FIVE consecutive commits and nobody noticed. The
# cause was a comment containing `https://user:secret@host`, which esbuild carried into the
# bundle, where the pre-publish scanner correctly flagged an endpoint-shaped string inside a
# binary that promises zero network calls.
#
# The charter already says "never assume CI passed, read it", and `docs/THE-CYCLE.md` says
# it again — and I pushed THE-CYCLE.md itself on a red build. A rule broken while being
# written is proof that writing it down is not the mechanism.
#
# So the check moves in front of the push. It is the same eight checks the release runs and
# takes seconds. SKIP_CHECKS=1 exists for a genuine emergency and prints that it was used,
# because a silent escape hatch becomes the default.
if [ "${SKIP_CHECKS:-}" = "1" ]; then
  echo "SKIP_CHECKS=1 — pushing WITHOUT typecheck/tests/pack. This is on the record." >&2
else
  npm run typecheck
  npx vitest run --silent
  npm run pack:cli >/dev/null
fi
: "${PAT:?PAT is not set. Export it for this command only; never write it to a file.}"

REPO="$(git config --get remote.origin.url | sed -E 's#https://[^@]*@#https://#')"
HOST_PATH="${REPO#https://}"

env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY \
  git push "https://x-access-token:${PAT}@${HOST_PATH}" "$BRANCH" 2>&1 | sed "s/${PAT}/<PAT>/g"

# The half that is always forgotten.
env -u https_proxy -u HTTPS_PROXY git fetch origin --quiet

LOCAL="$(git rev-parse "$BRANCH")"
REMOTE="$(env -u https_proxy -u HTTPS_PROXY git ls-remote origin "refs/heads/$BRANCH" | cut -f1)"
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "PUSH DID NOT LAND: local $LOCAL != remote $REMOTE" >&2
  exit 1
fi
echo "pushed and verified against the LIVE remote: ${LOCAL:0:7} · $(git log --oneline origin/main..$BRANCH | wc -l) unpushed"
