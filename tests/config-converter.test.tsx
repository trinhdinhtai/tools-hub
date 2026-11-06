import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openConfigConverter(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Config Converter" }));
  await screen.findByRole("textbox", { name: /^(Input|Dữ liệu nhập)$/ });
  return { user, platform };
}

const view = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;
const editorText = (name: string) => view(name).state.doc.toString();

/** A format button in the To group; the From group has the same names. */
const target = (name: string) => within(screen.getByRole("group", { name: "To" })).getByRole("button", { name });

function paste(name: string, text: string) {
  const editor = view(name);
  act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

describe("Config Converter", () => {
  it("detects the format of the Input, converts it, and copies the result", async () => {
    const { user } = await openConfigConverter();
    paste("Input", "name: app\nport: 8080\n");

    expect(await screen.findByText("Detected: YAML")).toBeInTheDocument();
    await user.click(target("TOML"));
    await vi.waitFor(() => expect(editorText("Output")).toBe('name = "app"\nport = 8080\n'));

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe('name = "app"\nport = 8080\n');
  });

  it("swaps the formats, the Output becoming the Input", async () => {
    const { user } = await openConfigConverter();
    paste("Input", '{"db":{"host":"x"}}');
    await user.click(target(".env"));
    await vi.waitFor(() => expect(editorText("Output")).toBe("db__host=x\n"));

    await user.click(screen.getByRole("button", { name: "Swap formats" }));
    expect(editorText("Input")).toBe("db__host=x\n");
    expect(within(screen.getByRole("group", { name: "From" })).getByRole("button", { name: ".env", pressed: true })).toBeInTheDocument();
    await vi.waitFor(() => expect(editorText("Output")).toBe('{\n  "db": {\n    "host": "x"\n  }\n}\n'));
  });

  it("remembers the output format as a Preference, but never stores the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await openConfigConverter(platform);
    paste("Input", "SECRET_TOKEN=hunter2\n");
    await user.click(target("JSON"));
    await vi.waitFor(() => expect(editorText("Output")).toBe('{\n  "SECRET_TOKEN": "hunter2"\n}\n'));

    expect(JSON.stringify(platform.dump())).not.toContain("hunter2");
    cleanup();

    await openConfigConverter(platform);
    expect(
      await within(screen.getByRole("group", { name: "To" })).findByRole("button", { name: "JSON", pressed: true }),
    ).toBeInTheDocument();
    expect(editorText("Input")).toBe("");
  });

  it("says where Input is not valid, in the interface language", async () => {
    const { user } = await openConfigConverter(createMemoryPlatform({ osLocale: "vi-VN" }));
    await user.click(within(screen.getByRole("group", { name: "Từ" })).getByRole("button", { name: "TOML" }));
    paste("Dữ liệu nhập", 'a = 1\nb = "open\n');

    expect(await screen.findByRole("alert")).toHaveTextContent("Không phải TOML hợp lệ: dòng 2");
    expect(editorText("Kết quả")).toBe("");
    expect(screen.queryByRole("button", { name: "Sao chép" })).not.toBeInTheDocument();
  });

  it("says when the output format cannot hold the config", async () => {
    const { user } = await openConfigConverter();
    paste("Input", '{"db":{"password":null}}');
    await user.click(target("TOML"));

    expect(await screen.findByRole("alert")).toHaveTextContent("TOML has no null, and “db.password” is null.");
  });

  it("asks for the format when it cannot tell it", async () => {
    await openConfigConverter();
    paste("Input", "just some words");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not tell which format this is. Pick it under From.");
  });

  it("opens with a config pasted on the app (Paste Detection)", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});

    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste("DB_HOST=localhost\nDB_PORT=5432\n");
    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /Config Converter/ }));

    expect(await screen.findByText("Detected: .env")).toBeInTheDocument();
    await vi.waitFor(() => expect(editorText("Output")).toBe("DB_HOST: localhost\nDB_PORT: \"5432\"\n"));
  });
});
