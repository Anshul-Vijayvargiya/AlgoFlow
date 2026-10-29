import type { ThemeName, ThemePreference } from './theme';

/**
 * The four named themes, as offered in the header and in Settings. The colours themselves live in src/index.css
 * (tokens under [data-theme] / [data-palette]); `swatch` repeats a few of them so a picker can show what each theme
 * looks like whichever theme is active. Keep them in step with index.css.
 */
export interface ThemeInfo {
  id: ThemeName;
  name: string;
  /** a few words for the picker */
  description: string;
  /** the page background, a panel, and the two accent colours */
  swatch: { page: string; panel: string; accent: string; accent2: string };
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'dark',
    name: 'Midnight Neon',
    description: 'Dark navy, cyan and blue',
    swatch: { page: '#070a12', panel: '#0f172a', accent: '#22d3ee', accent2: '#3b82f6' },
  },
  {
    id: 'galaxy',
    name: 'Purple Galaxy',
    description: 'Dark purple, violet and lavender',
    swatch: { page: 'oklch(14.9% 0.041 295)', panel: 'oklch(21.5% 0.076 295)', accent: 'oklch(81.9% 0.105 300)', accent2: 'oklch(63% 0.265 335)' },
  },
  {
    id: 'light',
    name: 'Arctic Light',
    description: 'White, icy blue and clean surfaces',
    swatch: { page: 'oklch(98.4% 0.009 230)', panel: '#ffffff', accent: '#0e7490', accent2: '#06b6d4' },
  },
  {
    id: 'sunset',
    name: 'Sunset Warm',
    description: 'Warm cream, peach and coral orange',
    swatch: { page: 'oklch(98.5% 0.009 60)', panel: 'oklch(97% 0.019 60)', accent: 'oklch(54.3% 0.16 42)', accent2: 'oklch(71.1% 0.181 35)' },
  },
];

export const themeInfo = (id: ThemeName): ThemeInfo => THEMES.find(t => t.id === id)!;

/** the picker's label for a preference: the theme's name, or System */
export const preferenceLabel = (preference: ThemePreference): string =>
  preference === 'system' ? 'System' : themeInfo(preference).name;
