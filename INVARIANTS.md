# Invariants — decisions that must not be silently reversed

A daily agent now works on this repo. Over weeks, the danger is not that it writes a bad
line; it is that it slowly **undoes decisions nobody remembers making** — reinstates a trial,
re-adds a hardcoded domain, lowers a threshold to make a test pass, restores a claim we cut
because it went native.

Charter rule 8 says: *a rule written in a document is not a control; if it matters, it is a
test.* This file is the human-readable index; **`tests/invariants.test.ts` is the control.**
Every row marked ENFORCED fails the build when reversed.

An invariant is not permanent. It is a decision that requires a **deliberate** reversal —
with Patrik's agreement, a new dated entry in the decisions log, and the test updated in the
same commit. What is forbidden is the quiet kind.

---

## The rules for changing this file

1. **Never edit a row to match new behaviour.** That inverts the control. Change the
   behaviour, or supersede the row with a dated note explaining what replaced it.
2. **Never delete a row.** Mark it `SUPERSEDED BY` and keep it. Deleted rows are how a
   project forgets it ever decided something.
3. **An agent may not reverse a row on its own initiative** — not because a test is
   inconvenient, not because a page reads better without it, not because a vendor changed.
   Report it and stop. Patrik decides.
4. **If a check disagrees with a row, the check wins until a human says otherwise.**

---

## Money and entitlements

| ID | Invariant | Status | Why |
|---|---|---|---|
| D-021 | **No free trials on paid plans.** The free tier is the demonstration. | ENFORCED | Patrik, 9 Aug. Also closed a finding: ~74 days of paid guard per throwaway email, repeatable. |
| D-021b | `trialing` and `past_due` still entitle. | ENFORCED | A hand-made Stripe subscription produces `trialing`; a card expiring should not cut someone off the same hour. |
| — | **Auditing is unlimited and free, forever.** Free is not a teaser. | ENFORCED | It is the argument for the paid tier. Metering it makes the paid tier a toll instead of a product. |
| D-020 | The CI gate is **Builder and above**, not Founder-only. | ENFORCED | The money in this category is at the pull-request boundary. |
| D-022 | A licence expires at `min(period end, 45 days)`. | ENFORCED | Offline verification means there is no revocation list. The expiry date is the only control that exists. |
| D-024 | **Checkout requires an account.** | ENFORCED | Anonymous checkout wrote `user_id: null`, so a person could be charged monthly for nothing. |
| D-023 | Metering is **per completed audit, flat** — never per token. | ADVISORY | Revenue from model calls would mean profiting exactly when the deterministic layer fails. |
| D-005 | **Not BYOK by default.** We pay for inference and meter it. | ADVISORY | BYOK stays a documented option, never the default. |
| D-018 | Cost per audit never appears outside `/admin`. | ENFORCED | Publishing unit cost publishes our margin. |

## Honesty and public claims

| ID | Invariant | Status | Why |
|---|---|---|---|
| H-1 | Every verdict carries its **method badge**. Never blur deterministic and judged. | ENFORCED | The whole moat. |
| H-2 | A judged verdict is **rejected** unless its quote is found literally in the output. | ENFORCED | Makes it impossible to pass an audit by inventing a sentence. |
| H-3 | `UNVERIFIABLE` is a valid outcome and must remain reachable. | ENFORCED | A checker that always answers is guessing. |
| H-4 | **No number on a public page without a source that says it.** | PARTIAL | Four claims shipped wrong; found 14 Aug by the weekly recon, not by us. |
| H-5 | `/what-is-already-free` stays honest **in both directions** — including when a vendor ships something we charge for. | ADVISORY | Two claims have already been cut this way. Cutting them is the point. |

## The guard

| ID | Invariant | Status | Why |
|---|---|---|---|
| D-007.1 | The guard **always exits 0 and speaks JSON**. | ENFORCED | A guard bug can never wedge a session. |
| D-007.2 | A corrupt policy degrades to a **visible warning, never a block**. | ENFORCED | Failing closed on a parse error locks people out of their own repo. |
| D-007.3 | Nothing inferred from prose is enabled without a click. | ENFORCED | Ambiguous proposals arrive switched off. |
| D-007.4 | `rm -rf` is split by target: a build directory warns, a filesystem root blocks. | ENFORCED | A guard that blocks ordinary work is uninstalled by Friday. |
| D-007.5 | **No `curl \| sh` installer.** | ENFORCED | We block that pattern by default. Shipping one would be indefensible. |
| — | The free path opens **no sockets**. | ENFORCED | Checked by stubbing the network in the release pipeline. |

## Engineering

| ID | Invariant | Status | Why |
|---|---|---|---|
| D-025 | The custom domain arrives **only** via `NEXT_PUBLIC_SITE_URL`. The deployment URL is always the fallback. | ENFORCED | A hardcoded fallback was added hours before DNS existed; it would have sent paying customers to a parking page. |
| E-1 | **One idea lives in one place.** Twelve duplicated-source bugs so far. | ADVISORY | Not mechanically checkable in general; individual instances are. |
| E-2 | **No literal `/` in a path comparison.** | ENFORCED | Five separator bugs, each caught only by the Windows leg of CI. |
| E-3 | Every check **reports its own coverage** and fails when that coverage is implausibly low. | ADVISORY | A scan that silently matches nothing passes. It has happened three times. |
| E-4 | Never name a custom class, variable or file after something the framework ships. | ADVISORY | `.invert` is Tailwind's `filter: invert(100%)`. Every check passed while the page painted backwards. |
| E-5 | The contact address exists in **one** place, and never on a domain we do not own. | ENFORCED | `hello@enforcee.app` sat in the LICENSE, unregistered, for the life of the project. |
| E-6 | Install instructions must work on **macOS, Linux and Windows**. | ENFORCED | The paid tier's first step was `mkdir -p` and `pbpaste`. |

---

## Not mechanically checkable — read these before changing tone or scope

- **The free tier is genuine.** If a change makes free meaningfully worse in order to sell
  the paid tier, that is a reversal of D-021 whatever the diff says.
- **We publish what we cannot do.** Removing a limitation from a page because it is
  unflattering is a reversal even though no test names it.
- **Never accuse the user of an error the tool caused.** Ten classes of false accusation have
  shipped; each became a named test.
- **Patrik is asked only for money, names, credentials, irreversible choices and taste.**
  Anything else handed to him is a defect.
