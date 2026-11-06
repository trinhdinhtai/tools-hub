import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openJsonViewer(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "JSON Viewer" }));
  await screen.findByRole("textbox", { name: /^(Input|Dữ liệu nhập)$/ });
  return { user, platform };
}

const view = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;
const editorText = (name: string) => view(name).state.doc.toString();

function paste(name: string, text: string) {
  const editor = view(name);
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

describe("JSON Viewer", () => {
  it("formats Input with the chosen indent, and copies the result", async () => {
    const { user } = await openJsonViewer();
    paste("Input", '{"a":1,"b":[true]}');

    await vi.waitFor(() => expect(editorText("Output")).toBe('{\n  "a": 1,\n  "b": [\n    true\n  ]\n}'));
    expect(screen.getByText("Valid JSON · 35 chars")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tab" }));
    await vi.waitFor(() => expect(editorText("Output")).toBe('{\n\t"a": 1,\n\t"b": [\n\t\ttrue\n\t]\n}'));

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe('{\n\t"a": 1,\n\t"b": [\n\t\ttrue\n\t]\n}');
  });

  it("minifies and sorts keys", async () => {
    const { user } = await openJsonViewer();
    paste("Input", '{\n  "b": 1,\n  "a": { "d": 2, "c": 3 }\n}');

    await user.click(screen.getByRole("button", { name: "Minify" }));
    await user.click(screen.getByRole("switch", { name: "Sort keys" }));
    await vi.waitFor(() => expect(editorText("Output")).toBe('{"a":{"c":3,"d":2},"b":1}'));
    expect(screen.getByRole("button", { name: "4 spaces" })).toBeDisabled();
  });

  it("remembers the indent as a Preference, but never stores the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await openJsonViewer(platform);
    paste("Input", '{"secret":"hunter2"}');
    await user.click(screen.getByRole("button", { name: "4 spaces" }));
    await vi.waitFor(() => expect(editorText("Output")).toBe('{\n    "secret": "hunter2"\n}'));

    expect(JSON.stringify(platform.dump())).not.toContain("hunter2");
    cleanup();

    await openJsonViewer(platform);
    expect(await screen.findByRole("button", { name: "4 spaces", pressed: true })).toBeInTheDocument();
    expect(editorText("Input")).toBe("");
  });

  it("says where and why Input is not valid JSON, in the interface language", async () => {
    await openJsonViewer(createMemoryPlatform({ osLocale: "vi-VN" }));
    paste("Dữ liệu nhập", '{\n  "a": 1,\n}');

    expect(await screen.findByRole("alert")).toHaveTextContent("Dòng 2, cột 9: dấu phẩy thừa: bỏ dấu “,” trước dấu đóng ngoặc");
    expect(editorText("Kết quả")).toBe("");
    expect(screen.queryByRole("button", { name: "Sao chép" })).not.toBeInTheDocument();
  });

  it("shows nothing for empty Input", async () => {
    await openJsonViewer();
    paste("Input", "  \n ");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(editorText("Output")).toBe("");
  });

  it("opens with JSON pasted on the app (Paste Detection)", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});

    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste('[{"x":1}]');
    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /JSON Viewer/ }));

    await vi.waitFor(() => expect(editorText("Output")).toBe('[\n  {\n    "x": 1\n  }\n]'));
  });
});
