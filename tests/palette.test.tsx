import { fireEvent, render, screen, within } from "@testing-library/react";
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

type User = ReturnType<typeof userEvent.setup>;

function renderApp(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  return { user, platform, ...view };
}

/** Waits for the app to load, then presses Ctrl+K and returns the palette. */
async function openPalette(user: User, name = "Search Tools") {
  await screen.findByRole("navigation");
  await user.keyboard("{Control>}k{/Control}");
  return screen.findByRole("dialog", { name });
}

const tabNames = () =>
  within(screen.getByRole("tablist"))
    .queryAllByRole("tab")
    .map((tab) => tab.textContent);

describe("Command palette", () => {
  it("opens Base64 from a Vietnamese alias typed without diacritics", async () => {
    const { user } = renderApp();
    await openPalette(user);

    await user.keyboard("ma hoa");
    expect(screen.getByRole("option", { name: /Base64/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tabNames()).toEqual(["Base64"]);
    expect(await screen.findByLabelText("Input")).toBeInTheDocument();
  });

  it("is driven entirely from the keyboard: arrows move, Enter opens, Esc closes", async () => {
    const { user } = renderApp();
    const palette = await openPalette(user);
    const selected = () => within(palette).getByRole("option", { selected: true });

    expect(within(palette).getByRole("combobox")).toHaveFocus();
    expect(within(palette).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Base64Converters",
      "Case ConverterText",
      "Code FormatterDevelopment",
      "Config ConverterConverters",
      "Cron CalculatorTime & Date",
      "Escape ToolsConverters",
      "Hash GeneratorGenerators",
      "IP / CIDR CalculatorNetwork",
      "JSON DiffDevelopment",
      "JSON ViewerDevelopment",
      "NotesText",
      "Number BaseConverters",
      "Password GeneratorGenerators",
      "Random StringGenerators",
      "Regex TesterDevelopment",
      "TickerUtilities",
      "Timestamp ConverterTime & Date",
      "URL EncoderConverters",
      "UUID GeneratorGenerators",
    ]);
    expect(selected()).toHaveTextContent("Base64");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(selected()).toHaveTextContent("UUID Generator");
    await user.keyboard("{ArrowDown}");
    expect(selected()).toHaveTextContent("Base64");
    await user.keyboard("{ArrowUp}");
    expect(selected()).toHaveTextContent("UUID Generator");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    await openPalette(user);
    await user.keyboard("not{Enter}");
    expect(tabNames()).toEqual(["Notes"]);
  });

  it("leaves Enter and the arrows to an IME while it is composing a word", async () => {
    const { user } = renderApp();
    const palette = await openPalette(user);
    const input = within(palette).getByRole("combobox");
    const selected = () => within(palette).getByRole("option", { selected: true });

    // Telex, VNI or a CJK IME: the keys that pick or commit a composed word must not move the list or open a Tool.
    fireEvent.keyDown(input, { key: "ArrowDown", isComposing: true });
    expect(selected()).toHaveTextContent("Base64");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(screen.getByRole("dialog", { name: "Search Tools" })).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(tabNames()).toEqual(["Base64"]);
  });

  it("matches English names and aliases while the interface is in Vietnamese", async () => {
    const { user } = renderApp(createMemoryPlatform({ osLocale: "vi-VN" }));
    const palette = await openPalette(user, "Tìm Công cụ");

    await user.keyboard("DECODE");
    expect(within(palette).getAllByRole("option").map((option) => option.textContent)).toEqual(["Base64Chuyển đổi", "URL EncoderChuyển đổi"]);
    await user.clear(within(palette).getByRole("combobox"));
    await user.keyboard("qwerty");
    expect(within(palette).queryAllByRole("option")).toEqual([]);
    expect(palette).toHaveTextContent("Không có Công cụ nào khớp “qwerty”.");
  });

  it("lists the Tools used lately first, remembers them, and forgets them on Clear Recent", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = renderApp(platform);
    const nav = await screen.findByRole("navigation", { name: "Tools" });
    await user.click(within(nav).getByRole("button", { name: "Ticker" }));
    await user.click(within(nav).getByRole("button", { name: "Base64" }));
    unmount();

    renderApp(platform);
    let palette = await openPalette(user);
    const group = (name: string) => within(within(palette).getByRole("group", { name })).getAllByRole("option");
    expect(group("Recent").map((option) => option.textContent)).toEqual(["Base64Converters", "TickerUtilities"]);
    expect(group("All Tools").map((option) => option.textContent)).toEqual([
      "Case ConverterText",
      "Code FormatterDevelopment",
      "Config ConverterConverters",
      "Cron CalculatorTime & Date",
      "Escape ToolsConverters",
      "Hash GeneratorGenerators",
      "IP / CIDR CalculatorNetwork",
      "JSON DiffDevelopment",
      "JSON ViewerDevelopment",
      "NotesText",
      "Number BaseConverters",
      "Password GeneratorGenerators",
      "Random StringGenerators",
      "Regex TesterDevelopment",
      "Timestamp ConverterTime & Date",
      "URL EncoderConverters",
      "UUID GeneratorGenerators",
    ]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("button", { name: "Clear Recent" }));
    await user.keyboard("{Escape}");
    palette = await openPalette(user);
    expect(within(palette).queryByRole("group", { name: "Recent" })).not.toBeInTheDocument();
    expect(JSON.stringify(platform.dump())).not.toContain("recent/");
  });

  it("opens with Cmd+K on macOS, leaving Ctrl+K to the text field", async () => {
    const { user } = renderApp(createMemoryPlatform({ osLocale: "en-US", isMac: true }));
    expect(await screen.findByRole("button", { name: /Search Tools/ })).toHaveTextContent("⌘K");

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByRole("dialog", { name: "Search Tools" })).toBeInTheDocument();
  });

  it("shows Ctrl K elsewhere", async () => {
    renderApp();
    expect(await screen.findByRole("button", { name: /Search Tools/ })).toHaveTextContent("Ctrl K");
  });

  it("also opens from the sidebar, and from inside a Tool's Input", async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole("button", { name: /Search Tools/ }));
    await user.keyboard("{Enter}");
    await user.click(await screen.findByLabelText("Input"));

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Search Tools" })).toBeInTheDocument();
    expect(screen.getByLabelText("Input")).toHaveValue("");
  });
});
