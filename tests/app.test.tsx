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

    await user.click(screen.getByRole("radio", { name: "Base32" }));
    expect(screen.getByLabelText("Output")).toHaveValue("MZXW6YTBOI======");
  });

  it("decodes and reports invalid Input", async () => {
    const { user } = renderApp("en-US");

    await user.click(await screen.findByRole("button", { name: "Base64" }));
    await user.click(await screen.findByRole("radio", { name: "Decode" }));

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
    expect(screen.getByRole("radio", { name: "Mã hoá" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "URL-safe" })).toBeInTheDocument();
  });

  it.each(["fr-FR", null])("falls back to English when the OS language is %j", async (osLocale) => {
    renderApp(osLocale);
    expect(await screen.findByRole("navigation", { name: "Tools" })).toBeInTheDocument();
  });
});
