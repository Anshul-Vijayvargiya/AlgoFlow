/*
 * Applies the saved theme before the app renders, so the page never flashes the wrong theme.
 * Same rules as src/theme/theme.ts (tested against it): key "algoflow-theme"; 'dark' | 'light' | 'system';
 * anything else is dark; 'system' is light only when the OS prefers light. Never throws.
 * A classic same-origin script (not inline), so a Content-Security-Policy of script-src 'self' still allows it.
 */
(function () {
  var preference = null;
  try {
    preference = window.localStorage.getItem('algoflow-theme');
  } catch {
    preference = null;
  }
  if (preference !== 'dark' && preference !== 'light' && preference !== 'system') preference = 'dark';
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
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
})();
