import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_BASE, THEME_PREFERENCES } from '../../src/theme/theme';
import { THEMES, preferenceLabel, themeInfo } from '../../src/theme/themes';

// The named themes (src/theme/themes.ts) against the stylesheet that defines their colours. Here rather than beside
// the theme code because it reads src/index.css from disk: Vitest blanks CSS imports, even with ?raw.
const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

/** the custom properties declared in the first rule whose selector is exactly `selector` */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('\n  }', start));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
/** numbers compared as numbers: 'oklch(63% 0.265 335)' equals 'oklch(63.0% 0.265 335)' */
const norm = (v: string) => v.toLowerCase().replace(/\d+(\.\d+)?/g, n => String(Number(n)));

// what each theme ends up with, in cascade order: :root, then the light base, then the theme's own block
const ROOT = tokens(':root');
const LIGHT = { ...ROOT, ...tokens(":root[data-theme='light']") };
const BLOCKS = {
  dark: ROOT,
  light: { ...LIGHT, ...tokens(":root[data-theme][data-palette='light']") },
  galaxy: { ...ROOT, ...tokens(":root[data-theme][data-palette='galaxy']") },
  sunset: { ...LIGHT, ...tokens(":root[data-theme][data-palette='sunset']") },
};

describe('the named themes', () => {
  it('are exactly the stored preferences other than system, each on its base, with a name and description', () => {
    expect(THEMES.map(t => t.id).sort()).toEqual(THEME_PREFERENCES.filter(p => p !== 'system').sort());
    expect(THEMES.map(t => t.name)).toEqual(['Midnight Neon', 'Purple Galaxy', 'Arctic Light', 'Sunset Warm']);
    expect(THEME_BASE).toEqual({ dark: 'dark', light: 'light', galaxy: 'dark', sunset: 'light' });
    for (const t of THEMES) expect(t.description.length, t.id).toBeGreaterThan(5);
    expect(preferenceLabel('system')).toBe('System');
    expect(preferenceLabel('galaxy')).toBe('Purple Galaxy');
  });

  it("each picker swatch shows the theme's real page background and accent (as in index.css)", () => {
    for (const t of THEMES) {
      expect(norm(t.swatch.page), `${t.id} page`).toBe(norm(BLOCKS[t.id]['--af-bg']));
      expect(norm(t.swatch.accent), `${t.id} accent`).toBe(norm(BLOCKS[t.id]['--af-accent']));
    }
  });

  it('every theme defines the full set of colour tokens; success, warning and error keep their hue everywhere', () => {
    const names = Object.keys(BLOCKS.dark).filter(k => k.startsWith('--af-'));
    for (const [id, block] of Object.entries(BLOCKS)) for (const n of names) expect(block[n], `${id} ${n}`).toBeDefined();
    for (const palette of ['galaxy', 'sunset', 'light']) {
      const own = tokens(`:root[data-theme][data-palette='${palette}']`);
      for (const status of ['--af-success', '--af-warning', '--af-error']) expect(own[status], `${palette} ${status}`).toBeUndefined();
    }
  });

  it('Galaxy and Sunset re-colour the brand accent and the neutrals (cyan, sky, blue and slate) at every shade', () => {
    for (const palette of ['galaxy', 'sunset']) {
      const own = tokens(`:root[data-theme][data-palette='${palette}']`);
      for (const hue of ['slate', 'cyan', 'sky', 'blue']) {
        for (const shade of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
          expect(own[`--color-${hue}-${shade}`], `${palette} ${hue}-${shade}`).toMatch(/^oklch\(/);
        }
      }
    }
    expect(themeInfo('dark').name).toBe('Midnight Neon');
  });
});
