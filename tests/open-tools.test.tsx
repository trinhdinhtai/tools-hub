import { render, screen, within } from "@testing-library/react";
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

function renderApp(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  return { user, platform, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

/** Opens a Tool from the sidebar. */
async function open(user: User, name: string) {
  const nav = await screen.findByRole("navigation", { name: "Tools" });
  await user.click(within(nav).getByRole("button", { name }));
}

const tabs = () => within(screen.getByRole("tablist", { name: "Open Tools" })).queryAllByRole("tab");
const tabNames = () => tabs().map((tab) => tab.textContent);

describe("Open Tools", () => {
  it("keeps Input while switching tabs and destroys it when the tab closes", async () => {
    const { user } = renderApp();
    await open(user, "Base64");
    await user.type(await screen.findByLabelText("Input"), "foo");
    await open(user, "Notes");
    await user.type(await screen.findByLabelText("Note"), "bar");

    await user.click(screen.getByRole("tab", { name: "Base64" }));
    expect(screen.getByLabelText("Input")).toHaveValue("foo");
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    expect(screen.getByLabelText("Note")).toHaveValue("bar");

    await user.click(screen.getByRole("button", { name: "Close Base64" }));
    expect(tabNames()).toEqual(["Notes"]);
    await open(user, "Base64");
    expect(await screen.findByLabelText("Input")).toHaveValue("");
  });

  it("switches to the tab of a Tool that is already open instead of opening it again", async () => {
    const { user } = renderApp();
    await open(user, "Base64");
    await open(user, "Notes");
    await open(user, "Base64");

    expect(tabNames()).toEqual(["Base64", "Notes"]);
    expect(screen.getByRole("tab", { name: "Base64", selected: true })).toBeInTheDocument();
  });

  it("keeps an Open Tool running while its tab is not on screen", async () => {
    const { user } = renderApp();
    await open(user, "Ticker");
    const ticks = await screen.findByTestId("ticks");
    await open(user, "Notes");
    expect(ticks).not.toBeVisible();

    const hiddenAt = Number(ticks.textContent);
    await vi.waitFor(() => expect(Number(ticks.textContent)).toBeGreaterThan(hiddenAt + 3));
  });

  it("restores the tabs after a restart, without their Input, and never stores Input", async () => {
    const MARKER = "MARKER-51c0-do-not-persist";
    const { user, platform, unmount } = renderApp();
    await open(user, "Notes");
    await user.type(await screen.findByLabelText("Note"), MARKER);
    await open(user, "Base64");
    await user.type(await screen.findByLabelText("Input"), MARKER);
    await user.click(screen.getByRole("tab", { name: "Notes" }));
    unmount();

    renderApp(platform);
    await screen.findByRole("tablist", { name: "Open Tools" });
    expect(tabNames()).toEqual(["Notes", "Base64"]);
    expect(screen.getByRole("tab", { name: "Notes", selected: true })).toBeInTheDocument();
    expect(await screen.findByLabelText("Note")).toHaveValue("");
    await user.click(screen.getByRole("tab", { name: "Base64" }));
    expect(await screen.findByLabelText("Input")).toHaveValue("");

    const stored = JSON.stringify(platform.dump());
    expect(stored).toContain('"openTools":["notes","base64"]');
    expect(stored).not.toContain(MARKER);
  });

  describe("tab menu", () => {
    async function openThree() {
      const app = renderApp();
      for (const name of ["Base64", "Notes", "Ticker"]) await open(app.user, name);
      return app;
    }

    async function chooseFromMenu(user: User, tab: string, item: string) {
      await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab", { name: tab }) });
      await user.click(await screen.findByRole("menuitem", { name: item }));
    }

    it("closes the other tabs", async () => {
      const { user } = await openThree();
      await chooseFromMenu(user, "Notes", "Close other tabs");
      expect(tabNames()).toEqual(["Notes"]);
      expect(screen.getByRole("tab", { name: "Notes", selected: true })).toBeInTheDocument();
    });

    it("closes the tabs to the right", async () => {
      const { user } = await openThree();
      await chooseFromMenu(user, "Base64", "Close tabs to the right");
      expect(tabNames()).toEqual(["Base64"]);
    });

    it("closes every tab", async () => {
      const { user } = await openThree();
      await chooseFromMenu(user, "Notes", "Close all tabs");
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Pick a Tool from the sidebar" })).toHaveFocus();
    });
  });

  it("moves between tabs with the arrow keys, Home and End, and closes the focused tab with Delete", async () => {
    const { user } = renderApp();
    for (const name of ["Base64", "Notes", "Ticker"]) await open(user, name);
    screen.getByRole("tab", { name: "Ticker" }).focus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Notes", selected: true })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Base64", selected: true })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Ticker", selected: true })).toHaveFocus();

    await user.keyboard("{Delete}");
    expect(tabNames()).toEqual(["Base64", "Notes"]);
    expect(screen.getByRole("tab", { name: "Notes", selected: true })).toHaveFocus();
    await user.tab({ shift: true });
    await user.tab();
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveFocus();
  });

  it("keeps keyboard focus on the page when the last tab closes", async () => {
    const { user } = renderApp();
    await open(user, "Notes");
    screen.getByRole("tab", { name: "Notes" }).focus();

    await user.keyboard("{Delete}");
    expect(screen.getByRole("heading", { name: "Pick a Tool from the sidebar" })).toHaveFocus();
  });

  it("keeps the tabs and their Input when every Preference is restored to its default", async () => {
    const { user, platform } = renderApp();
    await open(user, "Notes");
    await user.type(await screen.findByLabelText("Note"), "keep me");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("button", { name: "Restore defaults" }));
    await user.keyboard("{Escape}");

    expect(tabNames()).toEqual(["Notes"]);
    expect(screen.getByLabelText("Note")).toHaveValue("keep me");
    await vi.waitFor(() => expect(JSON.stringify(platform.dump())).toContain('"openTools":["notes"]'));
  });
});
