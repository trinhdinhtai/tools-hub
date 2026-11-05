import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { TFunction } from "i18next";
import { APP_NS } from "@/i18n";
import { cn } from "@/lib/utils";

export interface CodeEditorProps {
  /** The accessible name of the editor, e.g. the text of the label shown above it. */
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** Focusable, selectable and searchable, but not editable. */
  readOnly?: boolean;
  /** A CodeMirror language (e.g. from `@codemirror/lang-json`), for syntax highlighting. */
  language?: Extension;
  /** Marks the content as invalid, e.g. Input that cannot be decoded. */
  invalid?: boolean;
  className?: string;
}

/** CodeMirror's English phrases, translated through the `editor` keys of the app namespace. */
function phrases(t: TFunction<typeof APP_NS>): Record<string, string> {
  return {
    Find: t("editor.find"),
    Replace: t("editor.replace"),
    next: t("editor.next"),
    previous: t("editor.previous"),
    all: t("editor.all"),
    "match case": t("editor.matchCase"),
    regexp: t("editor.regexp"),
    "by word": t("editor.byWord"),
    replace: t("editor.replaceOne"),
    "replace all": t("editor.replaceAll"),
    close: t("editor.close"),
    "current match": t("editor.currentMatch"),
    "on line": t("editor.onLine"),
    "Go to line": t("editor.goToLine"),
    go: t("editor.go"),
    "replaced match on line $": t("editor.replacedMatchOnLine"),
    "replaced $ matches": t("editor.replacedMatches"),
    "Selection deleted": t("editor.selectionDeleted"),
    "Control character": t("editor.controlCharacter"),
  };
}

// Colours come from the app's theme variables, so the editor follows light and dark.
const theme = EditorView.theme({
  "&": { color: "var(--foreground)", backgroundColor: "transparent", fontSize: "13px", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "20px" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 25%, transparent)",
  },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--primary) 12%, transparent)" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--brand) 30%, transparent)" },
  ".cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--brand) 55%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search": { fontFamily: "var(--font-sans)", fontSize: "12px", padding: "6px 8px" },
  ".cm-textfield, .cm-button": {
    border: "1px solid var(--input)",
    borderRadius: "6px",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    backgroundImage: "none",
  },
  ".cm-textfield:focus-visible, .cm-button:focus-visible, .cm-panel input[type=checkbox]:focus-visible": {
    outline: "2px solid var(--ring)",
    outlineOffset: "1px",
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: "var(--primary)", fontWeight: "500" },
  { tag: [tags.string, tags.special(tags.string)], color: "light-dark(#15803d, #4ade80)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "light-dark(#1d4ed8, #60a5fa)" },
  { tag: [tags.propertyName, tags.attributeName], color: "light-dark(#7e22ce, #c084fc)" },
  { tag: [tags.comment], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [tags.invalid], color: "var(--destructive)" },
]);

/**
 * The app's code editor (CodeMirror 6): line numbers, syntax highlighting and search (Ctrl/Cmd+F). Controlled: it
 * shows `value` and reports edits through `onChange`. Tab is left to move focus, so the keyboard is never trapped.
 */
export function CodeEditor({ label, value, onChange, readOnly = false, language, invalid, className }: CodeEditorProps) {
  const { t, i18n } = useTranslation(APP_NS);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const shown = useRef(value);
  const onChangeRef = useRef(onChange);
  const compartments = useRef({
    attributes: new Compartment(),
    readOnly: new Compartment(),
    language: new Compartment(),
    phrases: new Compartment(),
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const c = compartments.current;
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: shown.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          highlightSpecialChars(),
          highlightSelectionMatches(),
          search({ top: true }),
          syntaxHighlighting(highlightStyle),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          theme,
          c.attributes.of([]),
          c.readOnly.of([]),
          c.language.of([]),
          c.phrases.of([]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            shown.current = update.state.doc.toString();
            onChangeRef.current?.(shown.current);
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const c = compartments.current;
    view.current?.dispatch({
      effects: [
        c.attributes.reconfigure(
          EditorView.contentAttributes.of({
            "aria-label": label,
            ...(readOnly ? { "aria-readonly": "true" } : {}),
            ...(invalid ? { "aria-invalid": "true" } : {}),
          }),
        ),
        c.readOnly.reconfigure(EditorState.readOnly.of(readOnly)),
        c.language.reconfigure(language ?? []),
      ],
    });
  }, [label, readOnly, invalid, language]);

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.current.phrases.reconfigure(EditorState.phrases.of(phrases(t))) });
  }, [t, i18n.language]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || value === shown.current) return;
    shown.current = value;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      data-invalid={invalid || undefined}
      className={cn(
        "overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-invalid:border-destructive data-invalid:ring-destructive/20 dark:bg-input/30 [&_.cm-editor]:h-full",
        className,
      )}
    />
  );
}
