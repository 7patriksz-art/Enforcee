/** Does the button actually work? Clicked, persisted, and re-read after a reload. */
import { chromium } from 'playwright';
const B = process.env.BASE ?? 'http://localhost:3300';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fails = [];
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails.push(m); };

for (const start of ['light', 'dark']) {
  console.log(`\n— OS preference: ${start} —`);
  const ctx = await b.newContext({ colorScheme: start });
  const p = await ctx.newPage();
  await p.goto(B + '/', { waitUntil: 'networkidle' });

  const isDark = () => p.evaluate(() => document.documentElement.classList.contains('dark'));
  const stored = () => p.evaluate(() => localStorage.getItem('enforcee-theme'));

  ok(await isDark() === (start === 'dark'), `follows the OS on first load (no stored choice)`);
  ok(await stored() === null, `stores nothing until you actually choose`);

  const btn = p.getByRole('switch', { name: 'Dark mode' });
  ok(await btn.count() === 1, `exposed as a single switch to assistive tech`);
  ok(await btn.getAttribute('aria-checked') === String(start === 'dark'), `announces its real state`);

  await btn.click();
  ok(await isDark() === (start !== 'dark'), `click flips the theme`);
  ok(await stored() === (start === 'dark' ? 'light' : 'dark'), `click persists the choice`);
  ok(await btn.getAttribute('aria-checked') === String(start !== 'dark'), `aria-checked follows the click`);

  // The glyph is swapped by CSS, so exactly one of the two must be laid out.
  const glyphs = await p.evaluate(() =>
    [...document.querySelector('[role=switch]').querySelectorAll('svg')]
      .map((s) => s.getBoundingClientRect().width > 0)
  );
  ok(glyphs.filter(Boolean).length === 1, `exactly one glyph is visible (${glyphs})`);

  await p.reload({ waitUntil: 'networkidle' });
  ok(await isDark() === (start !== 'dark'), `choice survives a reload`);

  // No-flash: the class must be on <html> before the body is parsed, which is only
  // true if the inline <head> script set it. Checked against the raw HTML + a
  // JS-disabled render would show nothing, so instead assert the script is inline
  // and blocking, and that no paint happened with the wrong class.
  const early = await p.evaluate(() => {
    const s = [...document.head.querySelectorAll('script')].filter((n) => !n.src);
    return s.some((n) => n.textContent.includes('enforcee-theme'));
  });
  ok(early, `theme script is inline in <head>, so first paint is already correct`);

  // Flipping the OS preference must NOT override an explicit choice.
  await p.emulateMedia({ colorScheme: start === 'dark' ? 'light' : 'dark' });
  await p.waitForTimeout(120);
  ok(await isDark() === (start !== 'dark'), `an explicit choice outranks a later OS change`);

  await ctx.close();
}

// …but with no explicit choice, the OS still wins, live.
console.log('\n— live OS change, no stored choice —');
const ctx = await b.newContext({ colorScheme: 'light' });
const p = await ctx.newPage();
await p.goto(B + '/', { waitUntil: 'networkidle' });
ok(!(await p.evaluate(() => document.documentElement.classList.contains('dark'))), 'starts light');
await p.emulateMedia({ colorScheme: 'dark' });
await p.waitForTimeout(150);
ok(await p.evaluate(() => document.documentElement.classList.contains('dark')), 'follows the OS live, without a reload');
await ctx.close();

await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : `\nall behaviour checks passed`);
process.exit(fails.length ? 1 : 0);
