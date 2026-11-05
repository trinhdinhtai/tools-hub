import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

vi.mock("@/app/registry", async (importOriginal) => {
  const registry = await importOriginal<typeof import("@/app/registry")>();
  const { FAKE_TOOLS } = await import("./fake-tools");
  return { ...registry, tools: [...registry.tools, ...FAKE_TOOLS] };
});

vi.mock("@/i18n", async (importOriginal) => {
  const i18n = await importOriginal<typeof import("@/i18n")>();
  const { FAKE_TOOL_NAMES } = await import("./fake-tools");
  return {
    ...i18n,
    async createI18n(locale: Parameters<typeof i18n.createI18n>[0]) {
      const instance = await i18n.createI18n(locale);
      for (const lng of ["en", "vi"]) instance.addResourceBundle(lng, i18n.TOOLS_NS, FAKE_TOOL_NAMES, true);
      return instance;
    },
  };
});

const BASE64 = "SGVsbG8sIFRvb2xzIEh1Yg=="; // "Hello, Tools Hub"

async function renderApp(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await screen.findByRole("navigation", { name: "Tools" });
  // The shell is on screen; let its effects run too, so its paste listener is in place.
  await act(async () => {});
  return { user, platform };
}

/** Pastes on the app's empty space: nothing editable has focus. */
async function pasteOnApp(user: ReturnType<typeof userEvent.setup>, text: string) {
  (document.activeElement as HTMLElement | null)?.blur();
  await user.paste(text);
}

const suggestions = () => screen.queryByRole("dialog", { name: "Open with" });

describe("Paste Detection", () => {
  it("suggests Base64 for a pasted Base64 string and opens it with the text as Input", async () => {
    const { user } = await renderApp();

    await pasteOnApp(user, BASE64);
    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /Base64/ }));

    expect(suggestions()).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Base64", selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Input")).toHaveValue(BASE64));
    expect(screen.getByRole("button", { name: "Decode", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Output")).toHaveValue("Hello, Tools Hub");
  });

  it("orders suggestions by score and leaves out Tools that score 0", async () => {
    const { user } = await renderApp();

    await pasteOnApp(user, BASE64);
    const dialog = await screen.findByRole("dialog", { name: "Open with" });

    const options = within(dialog).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Base64Converters", "NotesText"]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("opens the picked suggestion from the keyboard", async () => {
    const { user } = await renderApp();

    await pasteOnApp(user, "just some words");
    await screen.findByRole("dialog", { name: "Open with" });
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByLabelText("Note")).toHaveValue("just some words"));
  });

  it("hands a new paste to a Tool that is already open, in place of its Input", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.type(await screen.findByLabelText("Note"), "old");

    await pasteOnApp(user, "new words");
    await user.keyboard("{Enter}");

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByLabelText("Note")).toHaveValue("new words");
  });

  it("does nothing when no Tool matches", async () => {
    const { user } = await renderApp();

    await pasteOnApp(user, "   ");

    expect(suggestions()).not.toBeInTheDocument();
  });

  it("suggests nothing once turned off in Settings, and remembers that", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await renderApp(platform);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const toggle = await screen.findByRole("switch", { name: "Paste Detection" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await pasteOnApp(user, BASE64);
    expect(suggestions()).not.toBeInTheDocument();

    cleanup();
    await renderApp(platform);
    await pasteOnApp(user, BASE64);
    expect(suggestions()).not.toBeInTheDocument();
  });

  it("pastes into a field as usual, without suggestions", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Notes" }));

    await user.click(await screen.findByLabelText("Note"));
    await user.paste(BASE64);

    expect(screen.getByLabelText("Note")).toHaveValue(BASE64);
    expect(suggestions()).not.toBeInTheDocument();
  });

  it("pastes into a dialog as usual, without suggestions", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Settings" });

    await user.click(within(dialog).getByRole("heading", { name: "Settings" }));
    await user.paste(BASE64);

    expect(suggestions()).not.toBeInTheDocument();
  });

  it("suggests nothing while a dialog is open, even if focus has left it", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("dialog", { name: "Settings" });

    await pasteOnApp(user, BASE64);

    expect(suggestions()).not.toBeInTheDocument();
  });
});
