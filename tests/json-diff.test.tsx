import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openJsonDiff(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "JSON Diff" }));
  await screen.findByRole("textbox", { name: /^(Original|Bản gốc)$/ });
  return { user, platform };
}

const view = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;
const editorText = (name: string) => view(name).state.doc.toString();

function paste(name: string, text: string) {
  const editor = view(name);
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

describe("JSON Diff", () => {
  it("lists the changes by path and copies them as a JSON Patch", async () => {
    const { user } = await openJsonDiff();
    paste("Original", '{"name":"app","port":80}');
    paste("Modified", "name: app\nport: 8080\ntls: true\n");

    const list = await screen.findByRole("list", { name: "Changes" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "~Changed$.port80 → 8080",
      "+Added$.tlstrue",
    ]);
    expect(screen.getByText("1 added, 0 removed, 1 changed")).toBeInTheDocument();

    const patch = '[\n  {\n    "op": "replace",\n    "path": "/port",\n    "value": 8080\n  },\n  {\n    "op": "add",\n    "path": "/tls",\n    "value": true\n  }\n]\n';
    expect(editorText("JSON Patch")).toBe(patch);
    await user.click(screen.getByRole("button", { name: "Copy JSON Patch" }));
    expect(await navigator.clipboard.readText()).toBe(patch);
  });

  it("matches array items by the key typed, and remembers the key but never the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await openJsonDiff(platform);
    paste("Original", '[{"id":1,"secret":"hunter2"},{"id":2}]');
    paste("Modified", '[{"id":2},{"id":1,"secret":"hunter3"}]');
    await user.type(screen.getByRole("textbox", { name: "Match array items by key" }), "id");

    const list = await screen.findByRole("list", { name: "Changes" });
    await vi.waitFor(() =>
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        '~Changed$[id=1].secret"hunter2" → "hunter3"',
      ]),
    );
    expect(JSON.stringify(platform.dump())).not.toContain("hunter");
    cleanup();

    await openJsonDiff(platform);
    expect(screen.getByRole("textbox", { name: "Match array items by key" })).toHaveValue("id");
    expect(editorText("Original")).toBe("");
  });

  it("says when both documents hold the same values", async () => {
    await openJsonDiff();
    paste("Original", '{"a":1,"b":2}');
    paste("Modified", "b: 2\na: 1\n");
    expect(await screen.findByText("Both documents hold the same values")).toBeInTheDocument();
  });

  it("says which document is not valid and where, in the interface language", async () => {
    await openJsonDiff(createMemoryPlatform({ osLocale: "vi-VN" }));
    paste("Bản gốc", '{\n  "a": 1,\n}');
    paste("Bản sửa đổi", '{"a":2}');

    expect(await screen.findByRole("alert")).toHaveTextContent("Bản gốc không phải JSON hoặc YAML hợp lệ: dòng 3, cột 1.");
    expect(screen.queryByRole("textbox", { name: "JSON Patch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sao chép JSON Patch" })).not.toBeInTheDocument();
  });

  it("refuses a document nested too deep, without crashing", async () => {
    await openJsonDiff();
    paste("Original", "[1]");
    paste("Modified", "[".repeat(5000) + "]".repeat(5000));

    expect(await screen.findByRole("alert")).toHaveTextContent("Modified nests deeper than 1000 levels, too deep to compare.");
    expect(screen.getByRole("textbox", { name: "Original" })).toBeInTheDocument();
  });
});
