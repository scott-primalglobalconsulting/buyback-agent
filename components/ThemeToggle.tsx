'use client';

import { useSyncExternalStore } from 'react';

type Mode = 'light' | 'dark';

const THEME_EVENT = 'buyback:themechange';
// Namespaced: a bare 'theme' key collides with anything else served from the
// same origin, which on localhost is every other project on port 3000.
const THEME_KEY = 'buyback:theme';

// The active theme is not React state — it lives on <html data-theme>, written
// by the pre-paint script in app/layout.tsx before React exists. useSyncExternal
// Store subscribes to that external source instead of copying it into state in
// an effect, which is both the lint-clean form and the correct one: a mid-render
// OS theme change or a second tab writing localStorage both propagate here.
function subscribe(onChange: () => void) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

// An explicit override wins; otherwise report what the OS asks for. Returns a
// primitive, so useSyncExternalStore's identity check is a value comparison.
function getSnapshot(): Mode {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

// The server cannot know the viewer's OS preference, so it commits to neither
// button. The first client render corrects it.
function getServerSnapshot(): Mode | null {
  return null;
}

// Explicit theme override. The OS preference is the default: globals.css sets
// the dark tokens under `prefers-color-scheme: dark`, and `:root[data-theme]`
// overrides that in BOTH directions, so a viewer on a light OS can pin dark and
// a viewer on a dark OS can pin light.
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function choose(next: Mode) {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or blocked storage: the toggle still works for this page
      // view, it just will not be remembered. Not worth surfacing.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button
        type="button"
        onClick={() => choose('light')}
        aria-pressed={mode === 'light'}
      >
        Light
      </button>
      <button
        type="button"
        onClick={() => choose('dark')}
        aria-pressed={mode === 'dark'}
      >
        Dark
      </button>
    </div>
  );
}
