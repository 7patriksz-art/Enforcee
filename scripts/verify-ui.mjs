#!/usr/bin/env node
/**
 * One command that proves the front end works, in both themes, in a real browser.
 *
 *   npm run verify:ui
 *
 * It builds if needed, starts the production server on a free port, runs the
 * rendered contrast audit and the theme behaviour checks against it, and tears
 * everything down. No step here needs a human to look at a screen — which is the
 * whole point, and the standard the rest of this project is held to.
 *
 * Why a production build rather than `next dev`: dev serves unminified CSS with
 * different ordering, and this suite is checking cascade outcomes. Auditing dev
 * would be auditing something we do not ship.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';

const run = (cmd, args, opts = {}) =>
  new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts });
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} → ${code}`))));
  });

/** Ask the OS for a port instead of guessing one — parallel CI jobs collide. */
const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const args = process.argv.slice(2);

if (!args.includes('--no-build') || !existsSync('.next/BUILD_ID')) {
  console.log('▸ building');
  await run('npm', ['run', 'build']);
}

const port = await freePort();
const base = `http://localhost:${port}`;
console.log(`▸ serving on ${port}`);

const server = spawn('npm', ['run', 'start'], {
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Wait for the server to answer rather than sleeping a guessed number of seconds.
// A fixed sleep is how this kind of script starts failing on a slow CI box, and the
// failure looks like a product bug rather than a timing one.
const deadline = Date.now() + 60_000;
for (;;) {
  try {
    const r = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) {
    server.kill('SIGKILL');
    throw new Error(`server never became ready on ${base}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

let failed = 0;
try {
  console.log('\n▸ rendered contrast + painted-pixel audit');
  await run('node', ['scripts/theme-audit.mjs'], { env: { ...process.env, BASE: base } });
} catch (e) {
  console.error(String(e.message));
  failed++;
}
try {
  console.log('\n▸ theme behaviour');
  await run('node', ['scripts/theme-behaviour.mjs'], { env: { ...process.env, BASE: base } });
} catch (e) {
  console.error(String(e.message));
  failed++;
}

server.kill('SIGTERM');
setTimeout(() => server.kill('SIGKILL'), 3000).unref();

console.log(failed ? `\n${failed} UI check(s) failed` : '\nUI checks green');
process.exit(failed ? 1 : 0);
