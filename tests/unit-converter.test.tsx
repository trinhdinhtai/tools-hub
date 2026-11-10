import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Unit Converter" }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText("Value", {}, { timeout: 5000 });
  return { user, platform, unmount: view.unmount };
}

describe("Unit Converter", () => {
  it("converts a length into every other length unit as it is typed, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Value"), "1.5");

    expect(screen.getByLabelText("Centimetre (cm)")).toHaveValue("150");
    expect(screen.getByLabelText("Kilometre (km)")).toHaveValue("0.0015");
    expect(screen.getByLabelText("Foot (ft)")).toHaveValue("4.92125984251969");
    // The unit typed in is the Input, not a result.
    expect(screen.queryByLabelText("Metre (m)")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("1500000000");
  });

  it("reads the value in the unit the user picks", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("combobox", { name: "From unit" }));
    await user.click(await screen.findByRole("option", { name: "Mile (mi)" }));
    await user.type(screen.getByLabelText("Value"), "1");
    expect(screen.getByLabelText("Metre (m)")).toHaveValue("1609.344");
  });

  it("converts data sizes between decimal and binary units", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Data size" }));
    expect(screen.getByRole("combobox", { name: "From unit" })).toHaveTextContent("Megabyte (MB)");
    await user.type(screen.getByLabelText("Value"), "1024");

    expect(screen.getByLabelText("Mebibyte (MiB)")).toHaveValue("976.5625");
    expect(screen.getByLabelText("Gigabyte (GB)")).toHaveValue("1.024");
    expect(screen.getByLabelText("Byte (B)")).toHaveValue("1024000000");
  });

  it("converts temperatures, the value kept when the quantity changes", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Value"), "100");
    await user.click(screen.getByRole("button", { name: "Temperature" }));

    expect(screen.getByLabelText("Value")).toHaveValue("100");
    expect(screen.getByLabelText("Fahrenheit (°F)")).toHaveValue("212");
    expect(screen.getByLabelText("Kelvin (K)")).toHaveValue("373.15");
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Value"), "1,5");
    expect(screen.getByRole("alert")).toHaveTextContent("Use a dot for decimals");
    expect(screen.queryByLabelText("Centimetre (cm)")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "abc");
    expect(screen.getByRole("alert")).toHaveTextContent("This is not a number");

    await user.clear(screen.getByLabelText("Value"));
    await user.type(screen.getByLabelText("Value"), "2");
    expect(screen.getByLabelText("Centimetre (cm)")).toHaveValue("200");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a temperature below absolute zero", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Temperature" }));
    await user.type(screen.getByLabelText("Value"), "-300");
    expect(screen.getByRole("alert")).toHaveTextContent("below absolute zero");
  });

  it("keeps nothing: the Input never reaches the store", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Value"), "424242.5");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Unit Converter" }));
    expect(await screen.findByLabelText("Value")).toHaveValue("");
    expect(JSON.stringify(platform.dump())).not.toContain("424242");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Đổi đơn vị" }));
    await user.type(await screen.findByLabelText("Giá trị", {}, { timeout: 5000 }), "1");
    expect(screen.getByLabelText("Kilômét (km)")).toHaveValue("0.001");

    await user.click(screen.getByRole("button", { name: "Nhiệt độ" }));
    await user.clear(screen.getByLabelText("Giá trị"));
    await user.type(screen.getByLabelText("Giá trị"), "-500");
    expect(screen.getByRole("alert")).toHaveTextContent("thấp hơn độ không tuyệt đối");
  });
});
