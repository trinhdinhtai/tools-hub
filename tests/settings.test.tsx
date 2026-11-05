import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, MEMORY_STORE_PATH, type MemoryPlatform } from "@/platform/memory";

function renderApp(platform: MemoryPlatform) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  return { user, ...view };
}

async function openSettings(user: ReturnType<typeof userEvent.setup>, name = "Settings") {
  await user.click(await screen.findByRole("button", { name }));
  return screen.findByRole("heading", { level: 1, name });
}

const isDark = () => document.documentElement.classList.contains("dark");

afterEach(() => {
  document.documentElement.className = "";
});

describe("Settings", () => {
  it("switches the whole interface to another language at once and remembers it", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = renderApp(platform);
    await user.click(await screen.findByRole("button", { name: "Base64" }));
    expect(await screen.findByLabelText("Input")).toBeInTheDocument();
    await openSettings(user);

    await user.click(screen.getByRole("radio", { name: "Tiếng Việt" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Cài đặt" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Công cụ" })).toHaveTextContent("Chuyển đổi");
    expect(document.documentElement.lang).toBe("vi");
    await user.click(screen.getByRole("button", { name: "Base64" }));
    expect(await screen.findByLabelText("Dữ liệu nhập")).toBeInTheDocument();

    unmount();
    renderApp(platform);
    expect(await screen.findByRole("navigation", { name: "Công cụ" })).toBeInTheDocument();
  });

  it("follows the OS theme when the theme is System, and a fixed theme otherwise", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US", systemTheme: "dark" });
    const { user } = renderApp(platform);
    await openSettings(user);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(isDark()).toBe(true);

    platform.setSystemTheme("light");
    expect(await screen.findByRole("radio", { name: "System" })).toBeChecked();
    expect(isDark()).toBe(false);

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(isDark()).toBe(true);
    platform.setSystemTheme("light");
    expect(isDark()).toBe(true);
  });

  it("restores every Preference to its declared default", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US", systemTheme: "light" });
    const { user } = renderApp(platform);
    await user.click(await screen.findByRole("button", { name: "Base64" }));
    await user.click(await screen.findByRole("radio", { name: "Base32" }));
    await openSettings(user);
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    await user.click(screen.getByRole("radio", { name: "Tiếng Việt" }));

    await user.click(await screen.findByRole("button", { name: "Khôi phục mặc định" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/default/);
    expect(screen.getByRole("radio", { name: "System (English)" })).toBeChecked();
    expect(isDark()).toBe(false);
    await user.click(screen.getByRole("button", { name: "Base64" }));
    expect(await screen.findByRole("radio", { name: "Standard" })).toBeChecked();
  });

  it("shows where the store is saved and clears every Recent", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    await platform.store.set("recent/tool/color", { version: 1, data: ["#ff9900"] });
    const { user } = renderApp(platform);
    await openSettings(user);

    const storage = screen.getByText("Preferences file").closest("div")!.parentElement!;
    expect(await within(storage).findByText(MEMORY_STORE_PATH)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear Recent" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/cleared/);
    expect(platform.dump()).toEqual({});
  });
});
