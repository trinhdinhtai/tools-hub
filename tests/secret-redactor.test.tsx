import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";
import { handleRedactJob } from "@/tools/secret-redactor/redact-jobs";
import { inlineWorker } from "./inline-worker";

beforeEach(() => {
  vi.stubGlobal("Worker", inlineWorker(handleRedactJob));
});

const NAME = /^(Secret & PII Redactor|Che secret & dữ liệu cá nhân)$/;

// A fake token in the shape of a real one, put together here so no scanner takes this file for a leak.
const TOKEN = "ghp" + "_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
const SECRET_TEXT = `Deploy with token ${TOKEN}, then mail ana@example.com.`;

async function openRedactor(user = userEvent.setup()) {
  await user.click(await screen.findByRole("button", { name: NAME }));
  await screen.findByRole("textbox", { name: /^(Text|Văn bản)$/ });
  return user;
}

function renderApp(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  render(<App platform={platform} />);
  return platform;
}

const view = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;
const editorText = (name: string) => view(name).state.doc.toString();

function paste(name: string, text: string) {
  const editor = view(name);
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

describe("Secret & PII Redactor", () => {
  it("hides secrets behind placeholders to copy, then puts them back in the AI's reply", async () => {
    renderApp();
    const user = await openRedactor();
    paste("Text", SECRET_TEXT);

    const redacted = "Deploy with token [GITHUB_TOKEN_1], then mail [EMAIL_1].";
    await vi.waitFor(() => expect(editorText("Redacted")).toBe(redacted));
    const found = screen.getByRole("list", { name: "Hidden values" });
    expect(within(found).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "[GITHUB_TOKEN_1]GitHub token",
      "[EMAIL_1]Email",
    ]);
    // The list names the placeholders, never the values they hide.
    expect(found).not.toHaveTextContent(TOKEN);
    await user.click(screen.getByRole("button", { name: "Copy redacted text" }));
    expect(await navigator.clipboard.readText()).toBe(redacted);

    paste("AI reply", "Rotate [GITHUB_TOKEN_1] and tell [EMAIL_1].");
    const restored = `Rotate ${TOKEN} and tell ana@example.com.`;
    await vi.waitFor(() => expect(editorText("Restored")).toBe(restored));
    expect(screen.getByText("Restored: 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy restored text" }));
    expect(await navigator.clipboard.readText()).toBe(restored);
  });

  it("never puts the text or which placeholder stands for which value in the store", async () => {
    const platform = renderApp();
    await openRedactor();
    paste("Text", SECRET_TEXT);
    paste("AI reply", "[EMAIL_1]");
    await vi.waitFor(() => expect(editorText("Restored")).toBe("ana@example.com"));

    const stored = JSON.stringify(platform.dump());
    for (const leak of [TOKEN, "ana@example.com", "[EMAIL_1]", "GITHUB_TOKEN_1", "Deploy with"]) {
      expect(stored).not.toContain(leak);
    }
  });

  it("forgets which placeholder stands for which value once the tab closes", async () => {
    renderApp();
    const user = await openRedactor();
    paste("Text", SECRET_TEXT);
    await vi.waitFor(() => expect(editorText("Redacted")).toContain("[EMAIL_1]"));

    await user.click(screen.getByRole("button", { name: "Close Secret & PII Redactor" }));
    await openRedactor(user);
    expect(editorText("Text")).toBe("");
    paste("AI reply", "Tell [EMAIL_1].");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nothing to restore yet: paste a text with secrets in step 1 first.",
    );
    expect(editorText("Restored")).toBe("Tell [EMAIL_1].");
  });

  it("says which placeholders it did not make, and leaves them as they are", async () => {
    renderApp();
    await openRedactor();
    paste("Text", "mail ana@example.com");
    paste("AI reply", "[EMAIL_1] and [EMAIL_7]");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "These placeholders were not made from the text in step 1 and are left as they are: [EMAIL_7]",
    );
    expect(editorText("Restored")).toBe("ana@example.com and [EMAIL_7]");
  });

  it("refuses a text too large to scan, in the interface language, without crashing", async () => {
    renderApp(createMemoryPlatform({ osLocale: "vi-VN" }));
    await openRedactor();
    paste("Văn bản", "x".repeat(5_000_001));

    expect(await screen.findByRole("alert")).toHaveTextContent("Văn bản quá lớn để quét: tối đa 5.000.000 ký tự.");
    expect(editorText("Đã che")).toBe("");
  });
});
