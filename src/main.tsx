import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { createMemoryPlatform } from "@/platform/memory";
import { createTauriPlatform } from "@/platform/tauri";
// IBM Plex, bundled with the app (no remote fonts, ADR-0001); only the Latin and Vietnamese subsets.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/vietnamese-400.css";
import "@fontsource/ibm-plex-sans/vietnamese-500.css";
import "@fontsource/ibm-plex-sans/vietnamese-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/vietnamese-400.css";
import "./index.css";

// Outside Tauri (plain `vite` in a browser) the in-memory Platform stands in.
const platform = "__TAURI_INTERNALS__" in window ? createTauriPlatform() : createMemoryPlatform();

// Paint the OS theme until the theme Preference has loaded, so a dark OS never flashes light.
document.documentElement.classList.toggle("dark", platform.systemTheme.get() === "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
);
