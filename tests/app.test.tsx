import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform } from "@/platform/memory";

function renderApp(osLocale: string | null) {
  const user = userEvent.setup();
  render(<App platform={createMemoryPlatform({ osLocale })} />);
  return { user };
}

describe("App shell", () => {
  it("lists Base64 under Converters and converts text with it", async () => {
    const { user } = renderApp("en-US");

    const nav = await screen.findByRole("navigation", { name: "Tools" });
    expect(within(nav).getByText("Converters")).toBeInTheDocument();
    await user.click(within(nav).getByRole("button", { name: "Base64" }));

    const input = await screen.findByLabelText("Input");
    await user.type(input, "foobar");
    expect(screen.getByLabelText("Output")).toHaveValue("Zm9vYmFy");

    await user.click(screen.getByRole("button", { name: "Base32" }));
    expect(screen.getByLabelText("Output")).toHaveValue("MZXW6YTBOI======");
  });

  it("decodes and reports invalid Input", async () => {
    const { user } = renderApp("en-US");

    await user.click(await screen.findByRole("button", { name: "Base64" }));
    await user.click(await screen.findByRole("button", { name: "Decode" }));

    const input = screen.getByLabelText("Input");
    await user.type(input, "Zm9vYmFy");
    expect(screen.getByLabelText("Output")).toHaveValue("foobar");

    await user.type(input, "!");
    expect(screen.getByRole("alert")).toHaveTextContent(/not valid/i);
  });

  it("shows Vietnamese when the OS language is Vietnamese, keeping technical terms", async () => {
    const { user } = renderApp("vi-VN");

    const nav = await screen.findByRole("navigation", { name: "Công cụ" });
    expect(within(nav).getByText("Chuyển đổi")).toBeInTheDocument();
    await user.click(within(nav).getByRole("button", { name: "Base64" }));

    expect(await screen.findByLabelText("Dữ liệu nhập")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mã hoá" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "URL-safe" })).toBeInTheDocument();
  });

  it.each(["fr-FR", null])("falls back to English when the OS language is %j", async (osLocale) => {
    renderApp(osLocale);
    expect(await screen.findByRole("navigation", { name: "Tools" })).toBeInTheDocument();
  });
});

describe("Store (ADR-0004)", () => {
  it("remembers the Base64 alphabet but never writes Input to the store", async () => {
    const MARKER = "MARKER-7f3a9c-do-not-persist";
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const user = userEvent.setup();
    const { unmount } = render(<App platform={platform} />);

    await user.click(await screen.findByRole("button", { name: "Base64" }));
    await user.click(await screen.findByRole("button", { name: "URL-safe" }));
    await user.type(screen.getByLabelText("Input"), MARKER);
    expect(screen.getByLabelText("Output")).not.toHaveValue("");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Base64" }));
    expect(await screen.findByRole("button", { name: "URL-safe", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Input")).toHaveValue("");

    const stored = JSON.stringify(platform.dump());
    expect(stored).toContain("url-safe");
    expect(stored).not.toContain(MARKER);
    expect(stored).not.toContain(btoa(MARKER).replace(/=+$/, ""));
  });
});
