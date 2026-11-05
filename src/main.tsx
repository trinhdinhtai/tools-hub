import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { createMemoryPlatform } from "@/platform/memory";
import { createTauriPlatform } from "@/platform/tauri";
// Be Vietnam Pro (UI) and JetBrains Mono (code), bundled with the app (no remote fonts, ADR-0001).
// Import per weight, not per subset: only these files carry `unicode-range`, so each character is drawn from the
// subset that has it (the per-subset files claim every character and mix glyphs up, e.g. Vietnamese diacritics).
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./index.css";

// Outside Tauri (plain `vite` in a browser) the in-memory Platform stands in.
const platform = "__TAURI_INTERNALS__" in window ? createTauriPlatform() : createMemoryPlatform();

// A file dropped outside a drop zone would make the webview navigate to it, losing every Open Tool's Input.
// Text drags are left alone, so dropping text into a field still works.
for (const type of ["dragover", "drop"]) {
  window.addEventListener(type, (event) => {
    if ((event as DragEvent).dataTransfer?.types.includes("Files")) event.preventDefault();
  });
}

// Paint the OS theme until the theme Preference has loaded, so a dark OS never flashes light.
document.documentElement.classList.toggle("dark", platform.systemTheme.get() === "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
);
