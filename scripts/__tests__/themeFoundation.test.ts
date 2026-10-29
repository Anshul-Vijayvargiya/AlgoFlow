import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks of the theme foundation in index.html and src/index.css (read as files: Vitest stubs CSS imports).
// The theme logic itself is tested in src/theme/__tests__/theme.test.ts.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('index.html and index.css keep dark as the default', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8');

  it('the page starts dark, and the theme script runs in <head> before the app', () => {
    // Midnight Neon ('dark') on the dark base until theme-init.js applies the saved theme
    expect(html).toMatch(/<html lang="en" data-theme="dark" data-palette="dark" style="color-scheme: dark">/);
    expect(html).not.toMatch(/class="dark"/);
    const init = html.indexOf('<script src="/theme-init.js"></script>');
    expect(init).toBeGreaterThan(-1);
    expect(init).toBeLessThan(html.indexOf('</head>'));
    expect(init).toBeLessThan(html.indexOf('<script type="module" src="/src/main.tsx">'));
  });

  it('dark values are the existing appearance; light values exist only under [data-theme="light"]', () => {
    const block = (selector: string) => css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
    const dark = block(':root {');
    expect(dark).toMatch(/color-scheme: dark/);
    expect(dark).toMatch(/--af-bg: #070a12/);
    expect(dark).toMatch(/--af-text: #e2e8f0/);
    expect(dark).toMatch(/--af-focus: #22d3ee/);
    const light = block(":root[data-theme='light'] {");
    expect(light).toMatch(/color-scheme: light/);
    for (const v of ['--af-bg', '--af-text', '--af-text-muted', '--af-surface', '--af-border', '--af-input-bg', '--af-accent', '--af-focus']) {
      expect(dark, v).toContain(`${v}:`);
      expect(light, v).toContain(`${v}:`);
    }
    expect(css).toMatch(/background-color: var\(--af-bg\)/);
    expect(css).toMatch(/outline: 2px solid var\(--af-focus\)/);
  });

  it('Phase 3 tokens: dark values are the existing colours; the palette is re-coloured only under light', () => {
    const block = (selector: string) => css.slice(css.indexOf(selector), css.indexOf('\n  }', css.indexOf(selector)));
    const dark = block(':root {');
    const light = block(":root[data-theme='light'] {");
    expect(dark).toMatch(/--af-text-strong: #ffffff/);
    expect(dark).toMatch(/--af-surface: #0b0f19/);
    expect(dark).toMatch(/--af-grid: #1e293b15/);
    // the Tailwind palette is never overridden for dark, only for light (and the named themes, under [data-palette])
    expect(dark).not.toMatch(/--color-/);
    expect(light).toMatch(/--color-slate-900: oklch\(96\.8% 0\.007 247\.896\); \/\* slate-100 \*\//);
    expect(light).toMatch(/--color-cyan-400: oklch/);
    // fills used under white text (buttons) keep their colour
    for (const shade of ['500', '600', '700']) expect(light, shade).not.toMatch(new RegExp(`--color-cyan-${shade}:`));
    // semantic utilities read the variables
    expect(css).toMatch(/@theme inline \{[^}]*--color-page: var\(--af-bg\);[^}]*--color-surface: var\(--af-surface\);[^}]*--color-ink: var\(--af-text-strong\);/);
    expect(css).toMatch(/@custom-variant light \(&:where\(\[data-theme='light'\], \[data-theme='light'\] \*\)\);/);
  });
});
