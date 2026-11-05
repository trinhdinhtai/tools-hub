import { describe, expect, it } from "vitest";
import { createMemoryPlatform } from "@/platform/memory";
import { loadPreferences, type Schemas } from "./preferences";

const schemas: Schemas = {
  app: { preferences: { version: 1, defaults: { theme: "system", language: "system" } } },
  "tool/base64": { preferences: { version: 1, defaults: { variant: "standard" } } },
};

describe("Preferences", () => {
  it("starts from the declared defaults when nothing is stored", async () => {
    const prefs = await loadPreferences(createMemoryPlatform().store, schemas);
    expect(prefs.get("app")).toEqual({ theme: "system", language: "system" });
    expect(prefs.get("tool/base64")).toEqual({ variant: "standard" });
  });

  it("remembers a set value across reloads", async () => {
    const platform = createMemoryPlatform();
    const first = await loadPreferences(platform.store, schemas);
    await first.set("tool/base64", "variant", "url-safe");
    expect(first.get("tool/base64")).toEqual({ variant: "url-safe" });

    const second = await loadPreferences(platform.store, schemas);
    expect(second.get("tool/base64")).toEqual({ variant: "url-safe" });
    expect(second.get("app")).toEqual({ theme: "system", language: "system" });
  });

  it("refuses keys and namespaces that are not declared, and values of another type than the default", async () => {
    const platform = createMemoryPlatform();
    const prefs = await loadPreferences(platform.store, schemas);
    await expect(prefs.set("tool/base64", "input", "secret")).rejects.toThrow(/not declared/);
    await expect(prefs.set("tool/other", "variant", "x")).rejects.toThrow(/schema/);
    await expect(prefs.set("tool/base64", "variant", 42)).rejects.toThrow(/type/);
    expect(platform.dump()).toEqual({});
  });

  it("falls back to defaults when the stored schema version differs, and drops undeclared stored keys", async () => {
    const platform = createMemoryPlatform();
    await platform.store.set("preferences/tool/base64", { version: 0, data: { variant: "base32" } });
    await platform.store.set("preferences/app", { version: 1, data: { theme: "dark", leaked: "x", language: 3 } });

    const prefs = await loadPreferences(platform.store, schemas);
    expect(prefs.get("tool/base64")).toEqual({ variant: "standard" });
    expect(prefs.get("app")).toEqual({ theme: "dark", language: "system" });
  });

  it("restores every Preference, even of a namespace no longer declared, to its default", async () => {
    const platform = createMemoryPlatform();
    await platform.store.set("preferences/tool/removed", { version: 1, data: { x: 1 } });
    const prefs = await loadPreferences(platform.store, schemas);
    await prefs.set("app", "theme", "dark");
    await prefs.set("tool/base64", "variant", "base32");

    await prefs.resetAll();

    expect(prefs.get("app")).toEqual({ theme: "system", language: "system" });
    expect(prefs.get("tool/base64")).toEqual({ variant: "standard" });
    expect(platform.dump()).toEqual({});
  });
});

describe("Recent", () => {
  const withRecent: Schemas = { ...schemas, "tool/color": { recent: { version: 1, maxItems: 3 } } };

  it("keeps the newest items first, without duplicates, capped at maxItems, across reloads", async () => {
    const platform = createMemoryPlatform();
    const first = await loadPreferences(platform.store, withRecent);
    for (const color of ["#111", "#222", "#333", "#111", "#444"]) await first.addRecent("tool/color", color);
    expect(first.recent("tool/color")).toEqual(["#444", "#111", "#333"]);

    const second = await loadPreferences(platform.store, withRecent);
    expect(second.recent("tool/color")).toEqual(["#444", "#111", "#333"]);
  });

  it("refuses a namespace that declares no Recent", async () => {
    const platform = createMemoryPlatform();
    const prefs = await loadPreferences(platform.store, withRecent);
    await expect(prefs.addRecent("tool/base64", "Zm9v")).rejects.toThrow(/Recent/);
    expect(platform.dump()).toEqual({});
  });

  it("clears every Recent and leaves Preferences alone", async () => {
    const platform = createMemoryPlatform();
    await platform.store.set("recent/tool/removed", { version: 1, data: ["x"] });
    const prefs = await loadPreferences(platform.store, withRecent);
    await prefs.addRecent("tool/color", "#111");
    await prefs.set("app", "theme", "dark");

    await prefs.clearRecent();

    expect(prefs.recent("tool/color")).toEqual([]);
    expect(Object.keys(platform.dump())).toEqual(["preferences/app"]);
  });
});
