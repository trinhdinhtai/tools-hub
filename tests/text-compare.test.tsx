import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";
import { handleCompareJob } from "@/tools/text-compare/compare-jobs";
import { inlineWorker } from "./inline-worker";

beforeEach(() => {
  vi.stubGlobal("Worker", inlineWorker(handleCompareJob));
});

async function openTextCompare(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: /^(Text Compare|So sánh văn bản)$/ }));
  await screen.findByRole("textbox", { name: /^(Original|Bản gốc)$/ });
  return { user, platform };
}

const view = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;

function paste(name: string, text: string) {
  const editor = view(name);
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

/** The rows drawn in the pane of one text, as text. */
const shownRows = (pane: "Original" | "Modified") =>
  within(screen.getByRole("table", { name: pane }))
    .getAllByRole("row")
    .map((row) => row.textContent);

const currentRows = (pane: "Original" | "Modified") =>
  within(screen.getByRole("table", { name: pane }))
    .getAllByRole("row")
    .filter((row) => row.getAttribute("aria-current"))
    .map((row) => row.textContent);

describe("Text Compare", () => {
  it("shows the two texts in separate panes, lines aligned, marks the changed words, and copies a unified diff", async () => {
    const { user } = await openTextCompare();
    paste("Original", "alpha\nthe quick fox\ngamma");
    paste("Modified", "alpha\nthe slow fox\ngamma\ndelta");

    expect(await screen.findByText("1 added, 0 removed, 1 changed")).toBeInTheDocument();
    // A line only one text has leaves a blank row in the other pane, so the lines after it stay level.
    expect(shownRows("Original")).toEqual(["1alpha", "2Changed: the quick fox", "3gamma", ""]);
    expect(shownRows("Modified")).toEqual(["1alpha", "2Changed: the slow fox", "3gamma", "4Added: delta"]);
    const marks = (pane: string) =>
      [...screen.getByRole("table", { name: pane }).querySelectorAll("mark")].map((mark) => mark.textContent);
    expect(marks("Original")).toEqual(["quick"]);
    expect(marks("Modified")).toEqual(["slow"]);

    await user.click(screen.getByRole("button", { name: "Copy unified diff" }));
    expect(await navigator.clipboard.readText()).toBe(
      "--- Original\n+++ Modified\n@@ -1,3 +1,4 @@\n alpha\n-the quick fox\n+the slow fox\n gamma\n+delta\n",
    );
  });

  it("steps to the next and previous change, even far down a text of thousands of lines", async () => {
    const { user } = await openTextCompare();
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`);
    paste("Original", lines.join("\n"));
    // Thousands of lines take the editor a few seconds to lay out under jsdom, not in the app.
    paste("Modified", lines.map((line, i) => (i === 9 || i === 2499 ? `${line} edited` : line)).join("\n"));
    await screen.findByText("0 added, 0 removed, 2 changed", {}, { timeout: 10_000 });

    // Only the rows in sight are drawn.
    expect(shownRows("Original").length).toBeLessThan(100);
    expect(shownRows("Modified").length).toBe(shownRows("Original").length);
    expect(screen.getByRole("button", { name: "Previous change" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next change" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next change" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(currentRows("Original")).toEqual(["2500Changed: line 2500"]);
    expect(currentRows("Modified")).toEqual(["2500Changed: line 2500 edited"]);
    expect(screen.getByRole("button", { name: "Next change" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous change" }));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  }, 30_000);

  it("ignores whitespace and case when asked, and remembers the choice but never the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await openTextCompare(platform);
    paste("Original", "Secret  Value");
    paste("Modified", "secret value");
    expect(await screen.findByText("0 added, 0 removed, 1 changed")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Ignore whitespace" }));
    await user.click(screen.getByRole("switch", { name: "Ignore case" }));
    expect(await screen.findByText("Both texts are the same")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy unified diff" })).toBeDisabled();
    expect(JSON.stringify(platform.dump()).toLowerCase()).not.toContain("secret");
    cleanup();

    await openTextCompare(platform);
    expect(screen.getByRole("switch", { name: "Ignore case" })).toBeChecked();
    expect(view("Original").state.doc.toString()).toBe("");
  });

  it("refuses a text too large to compare, in the interface language, without crashing", async () => {
    await openTextCompare(createMemoryPlatform({ osLocale: "vi-VN" }));
    paste("Bản gốc", "a");
    paste("Bản sửa đổi", "x".repeat(5_000_001));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bản sửa đổi quá lớn để so sánh: tối đa 100.000 dòng và 5.000.000 ký tự.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
