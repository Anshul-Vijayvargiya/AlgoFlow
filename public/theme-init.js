/*
 * Applies the saved theme before the app renders, so the page never flashes the wrong theme.
 * Same rules as src/theme/theme.ts (tested against it): key "algoflow-theme"; 'dark' | 'light' | 'galaxy' | 'sunset' |
 * 'system'; anything else is dark; 'system' is light only when the OS prefers light. Sets data-theme to the theme's
 * base (galaxy is dark, sunset light) and data-palette to the theme itself. Never throws.
 * A classic same-origin script (not inline), so a Content-Security-Policy of script-src 'self' still allows it.
 */
(function () {
  var base = { dark: 'dark', light: 'light', galaxy: 'dark', sunset: 'light' };
  var preference = null;
  try {
    preference = window.localStorage.getItem('algoflow-theme');
  } catch {
    preference = null;
  }
  if (preference !== 'system' && !Object.prototype.hasOwnProperty.call(base, preference)) preference = 'dark';
  var theme = preference;
  if (preference === 'system') {
    theme = 'dark';
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
    } catch {
      theme = 'dark';
    }
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', base[theme]);
  root.setAttribute('data-palette', theme);
  root.style.colorScheme = base[theme];
})();
