import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";
import { handleFormatJob } from "@/tools/code-formatter/format-jobs";
import { inlineWorker } from "./inline-worker";

beforeEach(() => {
  vi.stubGlobal("Worker", inlineWorker(handleFormatJob));
});

async function openCodeFormatter(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Code Formatter" }));
  await screen.findByRole("textbox", { name: /^(Input|Dữ liệu nhập)$/ });
  return { user, platform };
}

const view = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;
const editorText = (name: string) => view(name).state.doc.toString();

function paste(name: string, text: string) {
  const editor = view(name);
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

describe("Code Formatter", () => {
  it("detects the language, beautifies, minifies, and copies the result", async () => {
    const { user } = await openCodeFormatter();
    paste("Input", "select a, b from t where x = 1");

    expect(await screen.findByText("Detected: SQL")).toBeInTheDocument();
    await vi.waitFor(() => expect(editorText("Output")).toBe("SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n"));

    await user.click(screen.getByRole("button", { name: "Minify" }));
    await vi.waitFor(() => expect(editorText("Output")).toBe("select a,b from t where x=1"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("select a,b from t where x=1");
  });

  it("formats as the language picked, whatever it looks like", async () => {
    const { user } = await openCodeFormatter();
    paste("Input", "<note><to>x</to></note>");
    expect(await screen.findByText("Detected: XML")).toBeInTheDocument();

    await user.click(within(screen.getByRole("group", { name: "Language" })).getByRole("button", { name: "HTML" }));
    await vi.waitFor(() => expect(editorText("Output")).toBe("<note><to>x</to></note>\n"));
    expect(screen.queryByText(/^Detected/)).not.toBeInTheDocument();
  });

  it("shows where invalid code fails in the interface language, and no Output", async () => {
    await openCodeFormatter(createMemoryPlatform({ osLocale: "vi-VN" }));
    paste("Dữ liệu nhập", "const a = {b:1");

    expect(await screen.findByRole("alert")).toHaveTextContent("Không phải JavaScript hợp lệ: dòng 1, cột 15.");
    expect(editorText("Kết quả")).toBe("");
    expect(screen.queryByRole("button", { name: "Sao chép" })).not.toBeInTheDocument();
  });

  it("says when it cannot tell the language", async () => {
    await openCodeFormatter();
    paste("Input", "just some words");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not tell which language this is.");
  });

  it("remembers the action and indent as Preferences, but never stores the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await openCodeFormatter(platform);
    paste("Input", "function secretToken(){return 'hunter2'}");
    await user.click(screen.getByRole("button", { name: "4 spaces" }));
    await vi.waitFor(() => expect(editorText("Output")).toBe('function secretToken() {\n    return "hunter2";\n}\n'));

    expect(JSON.stringify(platform.dump())).not.toContain("hunter2");
    cleanup();
    await openCodeFormatter(platform);
    expect(screen.getByRole("button", { name: "4 spaces", pressed: true })).toBeInTheDocument();
    expect(editorText("Input")).toBe("");
  });
});
