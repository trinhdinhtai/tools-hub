import type { SystemTheme } from "./types";

/** The webview reports the OS light/dark setting through `prefers-color-scheme`. */
export function mediaQuerySystemTheme(): SystemTheme {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  return {
    get: () => (query.matches ? "dark" : "light"),
    subscribe(listener) {
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
  };
}
