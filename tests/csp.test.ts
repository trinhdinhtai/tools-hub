import { describe, expect, it } from "vitest";
import tauriConf from "../src-tauri/tauri.conf.json";
import { checkCsp } from "./csp";

describe("Tauri CSP (ADR-0001)", () => {
  it("blocks every remote connection and resource", () => {
    expect(checkCsp(tauriConf.app.security.csp)).toEqual([]);
  });

  it("keeps Tauri's CSP injection on", () => {
    expect(tauriConf.app.security).not.toHaveProperty("dangerousDisableAssetCspModification");
  });
});

describe("checkCsp catches", () => {
  const strict =
    "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'";

  it("accepts a strict CSP", () => {
    expect(checkCsp(strict)).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["no CSP at all", null],
    ["a remote connect-src", strict.replace("connect-src ipc:", "connect-src https://api.example.com ipc:")],
    ["a wildcard", strict.replace("img-src 'self' data:", "img-src *")],
    ["a scheme-only source", strict.replace("img-src 'self' data:", "img-src 'self' https:")],
    ["a websocket", strict.replace("connect-src ipc:", "connect-src wss://example.com ipc:")],
    ["a bare host", strict.replace("img-src 'self' data:", "img-src cdn.example.com")],
    ["no default-src", strict.replace("default-src 'self'; ", "")],
    ["no connect-src", strict.replace("connect-src ipc: http://ipc.localhost; ", "")],
    ["unsafe-eval in scripts", `${strict}; script-src 'self' 'unsafe-eval'`],
  ])("%s", (_name, csp) => {
    expect(checkCsp(csp).length).toBeGreaterThan(0);
  });
});

describe("CodeEditor under the CSP", () => {
  // The CSP has no 'unsafe-eval', so the editor and everything it pulls in must never compile code from strings.
  // Styles are injected as <style> or constructed sheets, which `style-src 'unsafe-inline'` allows.
  const editorSources = import.meta.glob<string>(
    [
      "/node_modules/.pnpm/@codemirror+*/node_modules/@codemirror/*/dist/index.js",
      "/node_modules/.pnpm/@lezer+*/node_modules/@lezer/*/dist/index.js",
      "/node_modules/.pnpm/{style-mod,w3c-keyname,crelt}@*/node_modules/*/{src/style-mod,index}.js",
    ],
    { query: "?raw", import: "default", eager: true },
  );

  it("compiles no code at run time", () => {
    expect(Object.keys(editorSources).length).toBeGreaterThanOrEqual(8);
    const offending = Object.entries(editorSources)
      .filter(([, text]) => /\bnew Function\s*\(|\beval\s*\(/.test(text))
      .map(([file]) => file);
    expect(offending).toEqual([]);
  });
});
