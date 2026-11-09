import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Color Palette" }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText("Color", {}, { timeout: 5000 });
  return { user, platform };
}

const typeColor = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const input = screen.getByLabelText("Color");
  await user.clear(input);
  await user.paste(text);
};

describe("Color Palette", () => {
  it("shows a color in every format as it is typed, with copy", async () => {
    const { user } = await openTool();
    await typeColor(user, "rgb(59 130 246 / 50%)");

    expect(screen.getByLabelText("HEX")).toHaveValue("#3b82f680");
    expect(screen.getByLabelText("RGB")).toHaveValue("rgb(59 130 246 / 0.5)");
    expect(screen.getByLabelText("HSL")).toHaveValue("hsl(217.2 91.2% 59.8% / 0.5)");
    expect(screen.getByLabelText("HWB")).toHaveValue("hwb(217.2 23.1% 3.5% / 0.5)");
    expect(screen.getByLabelText("OKLCH")).toHaveValue("oklch(62.31% 0.188 259.81 / 0.5)");
    expect(screen.getByLabelText("HSV")).toHaveValue("hsv(217.2 76% 96.5% / 0.5)");

    const formats = screen.getByRole("region", { name: "Formats" });
    await user.click(within(formats).getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(within(formats).getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(await navigator.clipboard.readText()).toBe("#3b82f680");
  });

  it("builds shades and harmonies and copies them as CSS variables or JSON", async () => {
    const { user } = await openTool();
    await typeColor(user, "#ff0000");

    const shadesRegion = screen.getByRole("region", { name: "Shades" });
    expect(within(shadesRegion).getAllByRole("button", { name: /^Use #/ })).toHaveLength(11);
    expect(within(shadesRegion).getByRole("button", { name: "Use #ff0000" })).toBeInTheDocument();
    const css = (screen.getByLabelText("Shades as CSS variables") as HTMLTextAreaElement).value;
    expect(css).toMatch(/^:root \{\n {2}--color-50: #[0-9a-f]{6};\n/);
    expect(css).toContain("  --color-500: #ff0000;\n");

    await user.click(screen.getByRole("button", { name: "Triadic" }));
    await user.clear(screen.getByLabelText("Variable name"));
    await user.type(screen.getByLabelText("Variable name"), "brand");
    await user.click(screen.getByRole("button", { name: "JSON" }));
    const json = JSON.parse((screen.getByLabelText("Harmony as JSON") as HTMLTextAreaElement).value);
    expect(json).toEqual({ brand: { "triadic-1": "#ff0000", "triadic-2": "#00ff00", "triadic-3": "#0000ff" } });

    const exported = screen.getByRole("region", { name: "Export" });
    await user.click(within(exported).getAllByRole("button", { name: "Copy" })[1]!);
    await waitFor(() => expect(within(exported).getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(JSON.parse(await navigator.clipboard.readText())).toEqual(json);

    const harmonies = screen.getByRole("region", { name: "Harmonies" });

    // A swatch becomes the Input.
    await user.click(within(harmonies).getByRole("button", { name: "Use #0000ff" }));
    expect(screen.getByLabelText("Color")).toHaveValue("#0000ff");
  });

  it("remembers the last 8 colors copied, never the typed text, until Recent is cleared", async () => {
    const { user, platform } = await openTool();
    const colors = ["red", "#00ff00", "blue", "#111", "#222", "#333", "#444", "#555", "hsl(0 0% 40%)"];
    for (const color of colors) {
      await typeColor(user, color);
      const formats = screen.getByRole("region", { name: "Formats" });
      await user.click(within(formats).getAllByRole("button", { name: "Copy" })[1]!);
    }

    const recent = screen.getByRole("group", { name: "Recent" });
    const names = within(recent)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Use #666666",
      "Use #555555",
      "Use #444444",
      "Use #333333",
      "Use #222222",
      "Use #111111",
      "Use #0000ff",
      "Use #00ff00",
    ]);
    await user.click(within(recent).getByRole("button", { name: "Use #0000ff" }));
    expect(screen.getByLabelText("Color")).toHaveValue("#0000ff");

    const stored = JSON.stringify(platform.dump());
    expect(stored).toContain("#666666");
    expect(stored).not.toContain("hsl(0 0% 40%)");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("button", { name: "Clear Recent" }));
    await waitFor(() => expect(JSON.stringify(platform.dump())).not.toContain("#666666"));
  }, 15_000);

  it("keeps the export choices but not the color across app runs", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user } = await openTool(platform);
    await typeColor(user, "#abcdef");
    await user.click(screen.getByRole("button", { name: "JSON" }));
    cleanup();

    await openTool(platform);
    expect(screen.getByLabelText("Color")).toHaveValue("");
    await typeColor(userEvent.setup(), "#abcdef");
    expect(screen.getByRole("button", { name: "JSON", pressed: true })).toBeInTheDocument();
    expect(JSON.stringify(platform.dump())).not.toContain("abcdef");
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await typeColor(user, "rgb(1 2)");
    expect(screen.getByRole("alert")).toHaveTextContent("not written right");
    expect(screen.queryByLabelText("HEX")).not.toBeInTheDocument();

    await typeColor(user, "banana");
    expect(screen.getByRole("alert")).toHaveTextContent("not a CSS color");

    await typeColor(user, "tomato");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("HEX")).toHaveValue("#ff6347");
  });

  it("opens with a pasted color as its Input", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});
    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste("oklch(62.8% 0.2577 29.23)");

    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /Color Palette/ }));
    await waitFor(() => expect(screen.getByLabelText("Color")).toHaveValue("oklch(62.8% 0.2577 29.23)"), { timeout: 5000 });
    expect(screen.getByLabelText("HEX")).toHaveValue("#ff0000");
  });

  it("checks WCAG contrast on a background and offers the nearest color that passes", async () => {
    const { user, platform } = await openTool();
    await typeColor(user, "#3b82f6");

    const contrast = screen.getByRole("region", { name: "Contrast" });
    expect(screen.getByLabelText("Background")).toHaveValue("#ffffff");
    expect(screen.getByLabelText("Contrast ratio")).toHaveValue("3.67:1");
    const levels = within(contrast).getByRole("list", { name: "WCAG levels" });
    expect(within(levels).getByText("AA normal text (4.5:1) · Fail")).toBeInTheDocument();
    expect(within(levels).getByText("AA large text (3:1) · Pass")).toBeInTheDocument();
    expect(within(levels).getByText("UI components (3:1) · Pass")).toBeInTheDocument();

    await user.click(within(contrast).getAllByRole("button", { name: /^Cop(y|ied)$/ })[0]!);
    expect(await navigator.clipboard.readText()).toBe("3.67:1");

    const suggestion = (screen.getByLabelText("Nearest color for AA") as HTMLInputElement).value;
    expect(suggestion).toMatch(/^#[0-9a-f]{6}$/);
    await user.click(within(contrast).getAllByRole("button", { name: /^Cop(y|ied)$/ })[1]!);
    expect(await navigator.clipboard.readText()).toBe(suggestion);
    expect(within(screen.getByRole("group", { name: "Recent" })).getByRole("button", { name: `Use ${suggestion}` })).toBeInTheDocument();

    await user.click(within(contrast).getAllByRole("button", { name: "Use" })[0]!);
    expect(screen.getByLabelText("Color")).toHaveValue(suggestion);
    expect(within(levels).getByText("AA normal text (4.5:1) · Pass")).toBeInTheDocument();
    expect(screen.getByLabelText("Nearest color for AA")).toHaveValue(suggestion);
    expect(screen.getByText("The color already passes this level")).toBeInTheDocument();

    // Neither color is ever written to the store.
    await user.clear(screen.getByLabelText("Background"));
    await user.type(screen.getByLabelText("Background"), "#fafafa");
    expect(JSON.stringify(platform.dump())).not.toContain("fafafa");
  });

  it("swaps text and background, and says when no color reaches a level", async () => {
    const { user } = await openTool();
    await typeColor(user, "#777777");
    await user.clear(screen.getByLabelText("Background"));
    await user.paste("#777777");
    expect(screen.getByLabelText("Contrast ratio")).toHaveValue("1:1");
    expect(screen.getByLabelText("Nearest color for AAA")).toHaveValue("—");
    expect(screen.getByText("Not even black or white reaches this level on this background")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Background"));
    await user.paste("navy");
    await user.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByLabelText("Color")).toHaveValue("navy");
    expect(screen.getByLabelText("Background")).toHaveValue("#777777");

    await typeColor(user, "rgb(0 0 0 / 0.1)");
    await user.clear(screen.getByLabelText("Background"));
    await user.paste("#ffffff");
    expect(screen.getAllByText(/too transparent to reach this level/)).toHaveLength(2);
  });

  it("shows a clear error for an invalid background, without crashing", async () => {
    const { user } = await openTool();
    await typeColor(user, "#000000");
    const background = screen.getByLabelText("Background");
    await user.clear(background);
    await user.paste("rgb(1 2)");
    expect(screen.getByRole("alert")).toHaveTextContent("not written right");
    expect(screen.queryByLabelText("Contrast ratio")).not.toBeInTheDocument();

    await user.clear(background);
    await user.paste("🎨".repeat(5000));
    expect(screen.getByRole("alert")).toHaveTextContent("not a CSS color");

    await user.clear(background);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contrast ratio")).not.toBeInTheDocument();

    await user.paste("white");
    expect(screen.getByLabelText("Contrast ratio")).toHaveValue("21:1");
  });

  it("shows the color as people with color blindness see it", async () => {
    const { user } = await openTool();
    await typeColor(user, "#ff0000");
    const vision = screen.getByRole("region", { name: "Color blindness" });
    for (const [kind, hex] of [
      ["Normal vision", "#ff0000"],
      ["Protanopia", "#6d5f00"],
      ["Deuteranopia", "#a39000"],
      ["Achromatopsia", "#7f7f7f"],
    ] as const) {
      expect(within(vision).getByText(kind)).toBeInTheDocument();
      expect(within(vision).getByText(hex)).toBeInTheDocument();
    }
    await user.click(within(vision).getByRole("button", { name: "Use #6d5f00" }));
    expect(screen.getByLabelText("Color")).toHaveValue("#6d5f00");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Bảng màu" }));
    const input = await screen.findByLabelText("Màu", {}, { timeout: 5000 });
    await user.type(input, "color(srgb 1 0 0)");
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa hỗ trợ color()");

    await user.clear(input);
    await user.type(input, "#ff0000");
    expect(screen.getByRole("region", { name: "Dải sắc độ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bổ túc", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Dải sắc độ dạng Biến CSS")).toBeInTheDocument();
    expect(screen.getByLabelText("Tỉ lệ tương phản")).toHaveValue("3.99:1");
    expect(screen.getByText("AA chữ lớn (3:1) · Đạt")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mù màu" })).toHaveTextContent("Mù màu đỏ");
  });
});
