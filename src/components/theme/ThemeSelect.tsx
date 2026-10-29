import React from 'react';
import { Monitor } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';
import { isThemePreference, type ThemePreference } from '../../theme/theme';
import { THEMES, preferenceLabel, themeInfo, type ThemeInfo } from '../../theme/themes';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  ...THEMES.map(t => ({ value: t.id, label: t.name })),
  { value: 'system', label: 'System' },
];

/** a small round sample of a theme: its page colour with its two accents */
export const ThemeSwatchDot: React.FC<{ theme: ThemeInfo; className?: string }> = ({ theme, className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-block rounded-full border border-slate-500/50 shrink-0 ${className}`}
    style={{ background: `linear-gradient(135deg, ${theme.swatch.page} 0 45%, ${theme.swatch.accent} 45% 72%, ${theme.swatch.accent2} 72%)` }}
  />
);

/**
 * Compact theme picker (the four named themes, and System) for the header and the sign-in page. A native select:
 * keyboard and screen-reader operable, shows the current choice, and uses the platform picker on phones. It reads
 * and writes the shared theme store only, so it always agrees with Settings, which shows each theme's swatch.
 *
 * `compact` (the header): where the header is crowded — phones below sm, and between lg and 2xl where the full
 * navigation is shown — only the icon of the current choice is drawn and the (still focusable, still named) select is
 * laid transparently over it, so tapping or clicking opens the normal picker. The wrapper draws the focus ring the
 * invisible select cannot. Tailwind needs literal class names, hence the repeated max-sm / lg:max-2xl pairs.
 */
export const ThemeSelect: React.FC<{ id?: string; compact?: boolean }> = ({ id = 'theme-select', compact = false }) => {
  const preference = useThemeStore(s => s.preference);
  const setPreference = useThemeStore(s => s.setPreference);
  const theme = useThemeStore(s => s.theme);
  const label = preferenceLabel(preference);
  const iconClass = `w-3.5 h-3.5 mr-1.5 shrink-0 ${compact ? 'max-sm:mx-0 max-sm:my-[5px] lg:max-2xl:mx-0 lg:max-2xl:my-[5px]' : ''}`;

  return (
    <div
      title={`Theme: ${label}`}
      className={`relative flex items-center bg-slate-900/80 border border-slate-700/60 rounded-lg px-2.5 py-1 ${
        compact
          ? 'max-sm:has-[select:focus-visible]:outline-2 max-sm:has-[select:focus-visible]:outline-[var(--af-focus)] max-sm:has-[select:focus-visible]:outline-offset-2 lg:max-2xl:has-[select:focus-visible]:outline-2 lg:max-2xl:has-[select:focus-visible]:outline-[var(--af-focus)] lg:max-2xl:has-[select:focus-visible]:outline-offset-2'
          : ''
      }`}
    >
      {preference === 'system' ? (
        <Monitor className={`${iconClass} text-cyan-400`} aria-hidden="true" />
      ) : (
        <ThemeSwatchDot theme={themeInfo(theme)} className={iconClass} />
      )}
      <select
        id={id}
        aria-label="Theme"
        value={preference}
        onChange={e => {
          if (isThemePreference(e.target.value)) setPreference(e.target.value);
        }}
        className={`h-6 bg-transparent text-xs font-mono text-cyan-200 cursor-pointer rounded pr-1 ${
          compact
            ? 'max-sm:absolute max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:opacity-0 lg:max-2xl:absolute lg:max-2xl:inset-0 lg:max-2xl:w-full lg:max-2xl:h-full lg:max-2xl:opacity-0'
            : ''
        }`}
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value} className="bg-slate-900 text-slate-200">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};
