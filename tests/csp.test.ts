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
