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

  it("fixes JSON5, NDJSON and code literals into JSON when asked", async () => {
    const { user } = await openJsonViewer(createMemoryPlatform({ osLocale: "vi-VN" }));
    paste("Dữ liệu nhập", "{'a': None, 'b': (1, True),}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Dòng 1, cột 2");
    await user.click(screen.getByRole("button", { name: "Sửa thành JSON" }));

    expect(editorText("Dữ liệu nhập")).toBe('{\n  "a": null,\n  "b": [\n    1,\n    true\n  ]\n}');
    await vi.waitFor(() => expect(editorText("Kết quả")).toBe(editorText("Dữ liệu nhập")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers no fix for Input it cannot repair", async () => {
    await openJsonViewer();
    paste("Input", "{a: foo}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fix JSON" })).not.toBeInTheDocument();
  });

  it("shows only the value at a path, and says when the path finds nothing", async () => {
    const { user } = await openJsonViewer();
    paste("Input", '{"users":[{"name":"An"},{"name":"Bình"}]}');

    await user.type(screen.getByRole("textbox", { name: "Path" }), "$.users[[*].name");
    await vi.waitFor(() => expect(editorText("Output")).toBe('[\n  "An",\n  "Bình"\n]'));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe('[\n  "An",\n  "Bình"\n]');

    await user.clear(screen.getByRole("textbox", { name: "Path" }));
    await user.type(screen.getByRole("textbox", { name: "Path" }), "$.users[[2]");
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing at $.users[2]");
    expect(editorText("Output")).toBe("");

    await user.type(screen.getByRole("textbox", { name: "Path" }), "x");
    expect(await screen.findByRole("alert")).toHaveTextContent("Path is not valid at column 11");
  });

  it("browses JSON as a collapsible tree in Tree Mode", async () => {
    const { user } = await openJsonViewer();
    paste("Input", '{"user":{"name":"An","tags":["a","b"]},"n":1}');
    await user.click(screen.getByRole("button", { name: "Tree" }));

    const tree = await screen.findByRole("tree");
    const userNode = within(tree).getByRole("treeitem", { name: /^user/ });
    expect(userNode).toHaveAttribute("aria-expanded", "false");
    expect(within(tree).queryByText('"An"')).not.toBeInTheDocument();

    await user.click(within(userNode).getByText("user"));
    expect(userNode).toHaveAttribute("aria-expanded", "true");
    expect(within(tree).getByText('"An"')).toBeInTheDocument();
    expect(within(tree).getByRole("treeitem", { name: /^tags/ })).toHaveTextContent("[2]");

    // Arrow keys move between rows and open or close them.
    userNode.focus();
    await user.keyboard("{ArrowDown}");
    expect(within(tree).getByRole("treeitem", { name: /^name/ })).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(userNode).toHaveFocus();
    expect(userNode).toHaveAttribute("aria-expanded", "false");

    await user.type(screen.getByRole("textbox", { name: "Path" }), "$.user.tags");
    await vi.waitFor(() => expect(within(screen.getByRole("tree")).getAllByRole("treeitem")).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe('[\n  "a",\n  "b"\n]');
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
