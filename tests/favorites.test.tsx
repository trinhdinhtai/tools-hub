import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

/** Names of the Tools in the Favorites section of the sidebar, in order. */
const favorites = () => {
  const section = within(screen.getByRole("navigation", { name: "Tools" })).queryByRole("region", { name: "Favorites" });
  return section ? within(section).getAllByRole("button").map((button) => button.textContent) : [];
};

describe("Favorites", () => {
  it("pins Tools to the top of the sidebar, in pinning order, and remembers them", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = renderApp(platform);
    const nav = await screen.findByRole("navigation", { name: "Tools" });
    expect(favorites()).toEqual([]);

    await user.click(within(nav).getByRole("button", { name: "Ticker" }));
    await user.click(await screen.findByRole("button", { name: "Favorite", pressed: false }));
    await user.click(within(nav).getByRole("button", { name: "Base64" }));
    await user.click(await screen.findByRole("button", { name: "Favorite", pressed: false }));
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true");
    expect(favorites()).toEqual(["Ticker", "Base64"]);
    // The Favorites section comes first; each Tool keeps its place under its Category too.
    expect(within(nav).getAllByRole("region")[0]).toHaveAccessibleName("Favorites");
    expect(within(nav).getAllByRole("button", { name: "Base64" })).toHaveLength(2);
    unmount();

    renderApp(platform);
    await screen.findByRole("navigation", { name: "Tools" });
    expect(favorites()).toEqual(["Ticker", "Base64"]);
  });

  it("unpins from the tab's star or from the sidebar menu, also from the keyboard", async () => {
    const { user } = renderApp();
    const nav = await screen.findByRole("navigation", { name: "Tools" });
    await user.click(within(nav).getByRole("button", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: "Favorite" }));
    expect(favorites()).toEqual(["Notes"]);
    await user.click(screen.getByRole("button", { name: "Favorite" }));
    expect(favorites()).toEqual([]);

    // From the keyboard: Shift+F10 or the Menu key on a sidebar entry makes the browser fire `contextmenu` on it,
    // which jsdom does not do on its own.
    const base64 = within(nav).getByRole("button", { name: "Base64" });
    base64.focus();
    fireEvent.contextMenu(base64);
    await user.click(await screen.findByRole("menuitem", { name: "Add to Favorites" }));
    expect(favorites()).toEqual(["Base64"]);

    await user.pointer({ keys: "[MouseRight]", target: within(nav).getAllByRole("button", { name: "Base64" })[0]! });
    await user.click(await screen.findByRole("menuitem", { name: "Remove from Favorites" }));
    expect(favorites()).toEqual([]);
  });

  it("explains the star in a tooltip, not the browser's own title", async () => {
    const { user } = renderApp();
    const nav = await screen.findByRole("navigation", { name: "Tools" });
    await user.click(within(nav).getByRole("button", { name: "Notes" }));
    const star = await screen.findByRole("button", { name: "Favorite" });
    expect(star).not.toHaveAttribute("title");

    await user.hover(star);
    expect(await screen.findByText("Add to Favorites")).toBeInTheDocument();
    await user.click(star);
    await user.unhover(star);
    await user.hover(star);
    expect(await screen.findByText("Remove from Favorites")).toBeInTheDocument();
  });

  it("counts every click on the star, even two in a row before the screen updates", async () => {
    const { user } = renderApp();
    const nav = await screen.findByRole("navigation", { name: "Tools" });
    await user.click(within(nav).getByRole("button", { name: "Notes" }));
    const star = await screen.findByRole("button", { name: "Favorite" });

    act(() => {
      star.click();
      star.click();
    });
    expect(favorites()).toEqual([]);
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "false");
  });
});
