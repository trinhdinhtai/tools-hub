import { useState, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { EditorView } from "@codemirror/view";
import { StreamLanguage } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { CodeEditor } from "@/components/code-editor";
import { createI18n } from "@/i18n";
import type { Locale } from "@/lib/tool";

async function renderWithI18n(ui: ReactElement, locale: Locale = "en") {
  const i18n = await createI18n(locale);
  const user = userEvent.setup();
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
  return { user };
}

/** What a user typing into the editor does to it; jsdom cannot drive contenteditable typing. */
function typeInto(editor: HTMLElement, text: string) {
  const view = EditorView.findFromDOM(editor)!;
  view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: "input.type" });
}

function Controlled({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CodeEditor label="Input" value={value} onChange={setValue} />
      <output aria-label="Mirror">{value}</output>
      <button type="button">After</button>
    </>
  );
}

describe("CodeEditor", () => {
  it("is a textbox named by its label, showing and reporting its value", async () => {
    await renderWithI18n(<Controlled initial="Zm9v" />);
    const editor = screen.getByRole("textbox", { name: "Input" });
    expect(editor).toHaveTextContent("Zm9v");

    typeInto(editor, "YmFy");
    expect(await screen.findByLabelText("Mirror")).toHaveTextContent("Zm9vYmFy");
  });

  it("never traps the keyboard: Tab moves on to the next control", async () => {
    const { user } = await renderWithI18n(<Controlled initial="abc" />);
    const editor = screen.getByRole("textbox", { name: "Input" });
    editor.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("opens a labelled search field with Ctrl+F, and closes it with Escape", async () => {
    const { user } = await renderWithI18n(<Controlled initial="needle in a haystack" />);
    const editor = screen.getByRole("textbox", { name: "Input" });
    editor.focus();
    await user.keyboard("{Control>}f{/Control}");

    const find = await screen.findByRole("textbox", { name: "Find" });
    // CodeMirror focuses the field with `select()`, which focuses in browsers but not in jsdom.
    find.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Find" })).not.toBeInTheDocument();
    expect(editor).toHaveFocus();
  });

  it("names the search controls in the interface language", async () => {
    const { user } = await renderWithI18n(<CodeEditor label="Kết quả" value="abc" />, "vi");
    screen.getByRole("textbox", { name: "Kết quả" }).focus();
    await user.keyboard("{Control>}f{/Control}");
    expect(await screen.findByRole("textbox", { name: "Tìm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeInTheDocument();
  });

  it("is focusable but not editable when read-only", async () => {
    const changes: string[] = [];
    await renderWithI18n(<CodeEditor label="Output" value="Zm9v" readOnly onChange={(v) => changes.push(v)} />);
    const editor = screen.getByRole("textbox", { name: "Output" });
    expect(editor).toHaveAttribute("aria-readonly", "true");
    editor.focus();
    expect(editor).toHaveFocus();

    const view = EditorView.findFromDOM(editor)!;
    expect(view.state.readOnly).toBe(true);
  });

  it("highlights the syntax of the language it is given", async () => {
    const words = StreamLanguage.define({
      token(stream) {
        if (stream.match("let")) return "keyword";
        stream.next();
        return null;
      },
    });
    await renderWithI18n(<CodeEditor label="Code" value="let x" language={words} />);
    const keyword = screen.getByText("let");
    expect(keyword.tagName).toBe("SPAN");
    expect(keyword.className).not.toBe("");
  });
});

