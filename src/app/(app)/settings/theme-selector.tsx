"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const themeEvent = "roleprowl-theme-change";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  window.addEventListener(themeEvent, onChange);
  return () => window.removeEventListener(themeEvent, onChange);
}

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  window.localStorage.setItem("roleprowl-theme", next);
  window.dispatchEvent(new Event(themeEvent));
}

export function ThemeSelector() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");
  return (
    <div className="theme-selector" role="group" aria-label="Appearance">
      {(["light", "dark"] as const).map((value) => (
        <button
          aria-pressed={theme === value}
          className="button button-secondary"
          key={value}
          onClick={() => applyTheme(value)}
          type="button"
        >
          {value === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
