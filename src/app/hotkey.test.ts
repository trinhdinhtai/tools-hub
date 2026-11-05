import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, hotkeyKeys } from "./hotkey";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) =>
  new KeyboardEvent("keydown", { code, ...mods });

describe("acceleratorFromEvent", () => {
  it("names modifiers in a fixed order, then the key by its position", () => {
    expect(acceleratorFromEvent(key("Space", { altKey: true, ctrlKey: true }))).toBe("Ctrl+Alt+Space");
    expect(acceleratorFromEvent(key("KeyJ", { shiftKey: true, metaKey: true, ctrlKey: true }))).toBe("Ctrl+Shift+Super+J");
    expect(acceleratorFromEvent(key("Digit5", { altKey: true }))).toBe("Alt+5");
    expect(acceleratorFromEvent(key("F9", { ctrlKey: true }))).toBe("Ctrl+F9");
    expect(acceleratorFromEvent(key("ArrowUp", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+ArrowUp");
  });

  it("waits while only modifiers are held", () => {
    expect(acceleratorFromEvent(key("ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromEvent(key("AltRight", { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it("refuses a key with no modifier, or only Shift, which would steal ordinary typing", () => {
    expect(acceleratorFromEvent(key("KeyA"))).toBeNull();
    expect(acceleratorFromEvent(key("KeyA", { shiftKey: true }))).toBeNull();
    expect(acceleratorFromEvent(key("Enter"))).toBeNull();
  });
});

describe("hotkeyKeys", () => {
  it("splits a combination into the keys shown to the user, with macOS names on a Mac", () => {
    expect(hotkeyKeys("Ctrl+Alt+Space", false)).toEqual(["Ctrl", "Alt", "Space"]);
    expect(hotkeyKeys("Ctrl+Alt+Space", true)).toEqual(["⌃", "⌥", "Space"]);
    expect(hotkeyKeys("Shift+Super+ArrowUp", true)).toEqual(["⇧", "⌘", "↑"]);
    expect(hotkeyKeys("Super+K", false)).toEqual(["Win", "K"]);
  });
});
