import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Number Base" }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText("Input", {}, { timeout: 5000 });
  return { user, platform, unmount: view.unmount };
}

describe("Number Base", () => {
  it("converts a number to every base as it is typed, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "255");

    expect(screen.getByLabelText("Binary")).toHaveValue("11111111");
    expect(screen.getByLabelText("Octal")).toHaveValue("377");
    expect(screen.getByLabelText("Decimal")).toHaveValue("255");
    expect(screen.getByLabelText("Hexadecimal")).toHaveValue("ff");
    expect(screen.getByLabelText("Base 36")).toHaveValue("73");
    expect(screen.getByLabelText("Roman numerals")).toHaveValue("CCLV");

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("11111111");
  });

  it("keeps numbers beyond 2^53 exact", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "9007199254740993");
    expect(screen.getByLabelText("Decimal")).toHaveValue("9007199254740993");
    expect(screen.getByLabelText("Hexadecimal")).toHaveValue("20000000000001");
  });

  it("reads the Input in the base the user picks, prefixes included", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "0xff");
    expect(screen.getByLabelText("Decimal")).toHaveValue("255");

    await user.clear(screen.getByLabelText("Input"));
    await user.click(screen.getByRole("combobox", { name: "Input base" }));
    await user.click(await screen.findByRole("option", { name: "Base 36" }));
    await user.type(screen.getByLabelText("Input"), "zz");
    expect(screen.getByLabelText("Decimal")).toHaveValue("1295");
  });

  it("shows the two's complement at the chosen width", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "-1");
    expect(screen.getByLabelText("Two's complement (32-bit)")).toHaveValue("11111111111111111111111111111111");
    await user.click(screen.getByRole("combobox", { name: "Bit width" }));
    await user.click(await screen.findByRole("option", { name: "8" }));
    expect(screen.getByLabelText("Two's complement (8-bit)")).toHaveValue("11111111");
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "12x9");

    expect(screen.getByRole("alert")).toHaveTextContent("not a valid integer");
    expect(screen.queryByLabelText("Binary")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "42");
    expect(screen.getByLabelText("Binary")).toHaveValue("101010");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the Roman numerals blank outside 1–3999 and says why", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "4000");
    expect(screen.getByLabelText("Roman numerals")).toHaveValue("—");
    expect(screen.getByText("Roman numerals write 1–3999 only")).toBeInTheDocument();
  });

  it("evaluates an integer expression and shows the result in every base", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Expression", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "0xff & 0x0f");

    expect(screen.getByLabelText("Decimal")).toHaveValue("15");
    expect(screen.getByLabelText("Binary")).toHaveValue("1111");

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "1 / 0");
    expect(screen.getByRole("alert")).toHaveTextContent("divides by zero");
  });

  it("toggles bits on the grid and reads the value back", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Bits", pressed: false }));
    expect(await screen.findByLabelText("Value")).toHaveValue("0");

    await user.click(screen.getByRole("button", { name: "Bit 3" }));
    await user.click(screen.getByRole("button", { name: "Bit 0" }));
    expect(screen.getByLabelText("Signed value")).toHaveValue("9");
    expect(screen.getByLabelText("Hexadecimal")).toHaveValue("9");

    // The grid shows the two's complement: setting the top bit of a byte flips the signed value negative.
    await user.click(screen.getByRole("button", { name: "Bit 7" }));
    expect(screen.getByLabelText("Signed value")).toHaveValue("-119");
    expect(screen.getByLabelText("Unsigned value")).toHaveValue("137");
  });

  it("keeps nothing: the Input and the results never reach the store", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Input"), "in-memory-only");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Number Base" }));
    expect(await screen.findByLabelText("Input")).toHaveValue("");
    expect(JSON.stringify(platform.dump())).not.toContain("in-memory-only");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Cơ số" }));
    expect(await screen.findByLabelText("Đầu vào")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chuyển cơ số" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Biểu thức" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bit" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Đầu vào"), "255");
    expect(screen.getByLabelText("Nhị phân")).toHaveValue("11111111");
    expect(screen.getByLabelText("Chữ số La Mã")).toHaveValue("CCLV");
  });
});
