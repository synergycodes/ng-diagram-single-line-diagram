import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'sld-theme';
const DEFAULT_THEME: ThemeMode = 'dark';

// Reflects the theme onto `<html data-theme>` (which both our --c-* tokens and
// ng-diagram's --ngd-* tokens key off) and persists it. index.html sets the
// attribute before first paint; this keeps it in sync.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeMode>(readInitialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.dataset['theme'] = theme;
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // storage unavailable (private mode) — DOM attribute still applies
      }
    });
  }

  toggle(): void {
    this.theme.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }

  setTheme(theme: ThemeMode): void {
    this.theme.set(theme);
  }
}

function readInitialTheme(): ThemeMode {
  // Trust what the index.html inline script already applied to the DOM.
  const fromDom = document.documentElement.dataset['theme'];
  if (fromDom === 'light' || fromDom === 'dark') return fromDom;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore
  }
  return DEFAULT_THEME;
}
