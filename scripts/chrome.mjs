import { existsSync, readdirSync } from 'node:fs';

/**
 * Where Chromium is, without hardcoding where Chromium was on one machine.
 *
 * ── Why this file exists ──
 *
 * Both browser scripts used to open with:
 *
 *     chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
 *
 * That is the path in the sandbox this project is built in, pinned to a build number. It
 * works here and nowhere else. The moment `verify:ui` was wired into CI (2026-08-15) the
 * ubuntu leg went red on the first run — the runner has Playwright's own browser location
 * and no /opt/pw-browsers at all.
 *
 * The bug is small; the reason it survived is not. `verify:ui` is the ONLY control we own
 * that reads painted pixels, it was built after the `.invert` disaster specifically because
 * every non-pixel check had stayed green through it, and it had never run anywhere except
 * the one machine whose absolute path it contained. A control that can only run in the
 * environment that wrote it is a control that will not be there when the environment
 * changes — which is the same shape as the five path-separator bugs, and the same shape as
 * the email logo that pointed at a URL only one deploy could answer.
 *
 * Resolution order, most specific first:
 *   1. $CHROME            — an explicit override always wins.
 *   2. $PLAYWRIGHT_BROWSERS_PATH/chromium-*  — the sandbox layout, IF it is actually there.
 *   3. undefined          — hand the decision to Playwright, which knows where it installed
 *                           its own browser. This is the correct answer on any normal
 *                           machine and on CI, and it is what the old code made unreachable.
 *
 * Never returns a path that does not exist. Returning one produces a launch failure that
 * reads like a broken browser rather than a wrong string.
 */
export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root) {
    // Build-numbered directory: glob it rather than pinning 1194, which is a version that
    // will change under us and fail with the same confusing message.
    for (const suffix of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      for (const dir of ['chromium', 'chromium-1194']) {
        const p = `${root}/${dir}/${suffix}`;
        if (existsSync(p)) return p;
      }
    }
    // Any chromium-* directory present, whatever its build number.
    try {
      for (const d of readdirSync(root).filter((x) => x.startsWith('chromium-'))) {
        const p = `${root}/${d}/chrome-linux/chrome`;
        if (existsSync(p)) return p;
      }
    } catch {
      /* fall through to Playwright's own resolution */
    }
  }

  return undefined;
}

/** Launch options, with executablePath omitted entirely when we have nothing better. */
export function launchOptions(extra = {}) {
  const executablePath = chromePath();
  return executablePath ? { executablePath, ...extra } : { ...extra };
}
