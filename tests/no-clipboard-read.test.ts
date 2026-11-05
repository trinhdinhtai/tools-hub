import { describe, expect, it } from "vitest";

// Paste Detection works only on paste events the user makes: the app never reads the clipboard on its own.
const sources = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "/src-tauri/src/**/*.rs"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const CLIPBOARD_READ = [
  /navigator\s*\.\s*clipboard\s*\.\s*read/, // read() and readText()
  /plugin-clipboard/, // @tauri-apps/plugin-clipboard-manager
  /clipboard_manager|ClipboardExt/, // the Rust side of the same plugin
  /execCommand\(\s*["']paste["']/,
];

describe("No clipboard reads", () => {
  it("has no code that reads the clipboard", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    const offending = Object.entries(sources).flatMap(([file, text]) =>
      CLIPBOARD_READ.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`),
    );
    expect(offending).toEqual([]);
  });
});
