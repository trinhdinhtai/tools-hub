import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

type User = ReturnType<typeof userEvent.setup>;

async function openSettings(user: User, name = "Settings") {
  await user.click(await screen.findByRole("button", { name }));
  return screen.findByRole("dialog", { name });
}

function renderApp(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  return { user, platform, ...view };
}

describe("Global hotkey", () => {
  it("registers Ctrl+Alt+Space by default and opens the palette when pressed from anywhere", async () => {
    const { platform } = renderApp();
    await screen.findByRole("navigation");
    expect(platform.desktopState().globalHotkey).toBe("Ctrl+Alt+Space");

    act(() => platform.pressGlobalHotkey());
    expect(await screen.findByRole("dialog", { name: "Search Tools" })).toBeInTheDocument();
  });
});

describe("Global hotkey in Settings", () => {
  it("records a new combination, uses it at once and remembers it", async () => {
    const { user, platform, unmount } = renderApp();
    const dialog = await openSettings(user);
    const button = within(dialog).getByRole("button", { name: /Global hotkey/ });
    expect(button).toHaveTextContent("CtrlAltSpace");

    await user.click(button);
    expect(button).toHaveTextContent("Press a combination");
    await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");

    expect(button).toHaveTextContent("CtrlShiftJ");
    expect(platform.desktopState().globalHotkey).toBe("Ctrl+Shift+J");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    unmount();
    renderApp(platform);
    await screen.findByRole("navigation");
    expect(platform.desktopState().globalHotkey).toBe("Ctrl+Shift+J");
  });

  it("cancels recording with Esc, leaving the hotkey and the dialog as they were", async () => {
    const { user, platform } = renderApp();
    const dialog = await openSettings(user);
    const button = within(dialog).getByRole("button", { name: /Global hotkey/ });

    await user.click(button);
    await user.keyboard("a{Escape}");

    expect(button).toHaveTextContent("CtrlAltSpace");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(platform.desktopState().globalHotkey).toBe("Ctrl+Alt+Space");
  });

  it("says so when another app holds the combination, and keeps the hotkey that works", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US", takenHotkeys: ["Ctrl+Shift+J"] });
    const { user } = renderApp(platform);
    const dialog = await openSettings(user);
    const button = within(dialog).getByRole("button", { name: /Global hotkey/ });

    await user.click(button);
    await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ctrl+Shift+J");
    expect(button).toHaveTextContent("CtrlAltSpace");
    expect(platform.desktopState().globalHotkey).toBe("Ctrl+Alt+Space");

    act(() => platform.pressGlobalHotkey());
    expect(await screen.findByRole("dialog", { name: "Search Tools" })).toBeInTheDocument();
  });

  it("shows in Settings that the saved hotkey could not be registered at startup, without crashing", async () => {
    const platform = createMemoryPlatform({ osLocale: "vi-VN", takenHotkeys: ["Ctrl+Alt+Space"] });
    const { user } = renderApp(platform);
    const dialog = await openSettings(user, "Cài đặt");

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Ctrl+Alt+Space");
    expect(platform.desktopState().globalHotkey).toBeNull();
  });
});

describe("Window, tray and autostart", () => {
  it("hides to the tray on close and stays off at login by default; both are switches in Settings", async () => {
    const { user, platform } = renderApp();
    const dialog = await openSettings(user);
    expect(platform.desktopState()).toMatchObject({ quitOnClose: false, autostart: false });

    await user.click(within(dialog).getByRole("switch", { name: "Quit when the window closes" }));
    await user.click(within(dialog).getByRole("switch", { name: "Launch at login" }));

    expect(platform.desktopState()).toMatchObject({ quitOnClose: true, autostart: true });
  });

  it("labels the tray menu in the interface language", async () => {
    const platform = createMemoryPlatform({ osLocale: "vi-VN" });
    renderApp(platform);
    await screen.findByRole("navigation");
    expect(platform.desktopState().trayLabels).toEqual({ open: "Mở Tools Hub", quit: "Thoát" });
  });
});
