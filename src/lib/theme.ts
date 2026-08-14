/**
 * Theme, in one place.
 *
 * The storage key and the resolution rule are shared by two consumers that cannot
 * import from each other: the React toggle, and a raw string of JavaScript that runs
 * in <head> before React exists. Duplicating the rule between them is exactly the
 * "one idea, two copies" bug this project has now shipped a dozen times — the copies
 * agree until someone changes one, and then the page flashes the wrong colour for
 * one frame on every load and nobody can work out why.
 *
 * So the inline script is GENERATED from this file rather than written twice.
 */

export const THEME_KEY = 'enforcee-theme';

export type ThemeChoice = 'light' | 'dark';

/**
 * The blocking script for <head>.
 *
 * It must be synchronous and it must come before any painted markup. A theme applied
 * in useEffect runs after first paint, so every visitor with dark mode set sees a
 * full white page for one frame — the "flash of incorrect theme". It is the single
 * most common dark-mode implementation bug and it is entirely fixed by six lines
 * running early.
 *
 * Wrapped in try/catch because localStorage THROWS rather than returning null in
 * Safari private browsing and under some enterprise cookie policies. Unhandled, that
 * exception kills the script and the fix becomes the bug.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});
var d=c==='dark'||(c!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
if(d){document.documentElement.classList.add('dark');}
}catch(e){}})();`;
