import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { createMemoryPlatform } from "@/platform/memory";
import { createTauriPlatform } from "@/platform/tauri";
import "./index.css";

// Outside Tauri (plain `vite` in a browser) the in-memory Platform stands in.
const platform = "__TAURI_INTERNALS__" in window ? createTauriPlatform() : createMemoryPlatform();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App platform={platform} />
  </StrictMode>,
);
