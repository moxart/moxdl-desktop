import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";

// Dark, light, or as the system is set. The colors for each are in theme/tokens.css; this only
// puts data-theme on the page, and tells the window so its title bar and background match.

export type ThemeChoice = "system" | "dark" | "light";

const KEY = "mox.theme";
const DARK_BG = "#141113";
const LIGHT_BG = "#f8f4f2";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const saved = (): ThemeChoice => {
  // ?theme=light in a plain browser (npm run dev), for screenshots of either theme.
  const asked = "__TAURI_INTERNALS__" in window ? null : new URLSearchParams(location.search).get("theme");
  if (asked === "dark" || asked === "light") return asked;
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
};

let choice: ThemeChoice = saved();
const listeners = new Set<() => void>();

const apply = () => {
  const dark = choice === "dark" || (choice === "system" && systemDark.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (!("__TAURI_INTERNALS__" in window)) return;
  const win = getCurrentWindow();
  win.setTheme(choice === "system" ? null : choice).catch(() => {});
  // What shows for a moment while the window resizes, before the page catches up.
  win.setBackgroundColor(dark ? DARK_BG : LIGHT_BG).catch(() => {});
};
apply();
systemDark.addEventListener("change", apply);

export const setTheme = (next: ThemeChoice) => {
  choice = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // only this run looks this way
  }
  apply();
  listeners.forEach((listener) => listener());
};

export const useThemeChoice = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => choice,
  );
