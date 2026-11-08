import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

const NANO = /^[A-Za-z0-9_-]+$/;
const HEX = /^[0-9a-f]+$/;

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Random String" }));
  await screen.findByLabelText("Length");
  return { user, platform };
}

/** The generated value: the labelled output span, one string per line. */
function output() {
  return screen.getByLabelText("Output");
}

describe("Random String", () => {
  it("generates one Nano ID of the asked length, with copy", async () => {
    const { user } = await openTool();
    const first = output().textContent!;
    expect(first).toHaveLength(32);
    expect(NANO.test(first)).toBe(true);

    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "21");
    expect(output().textContent).toHaveLength(21);
    expect(output().textContent).not.toBe(first);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe(output().textContent);
  });

  it("re-rolls on Generate without changing any option", async () => {
    const { user } = await openTool();
    const first = output().textContent!;
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(output().textContent).not.toBe(first);
  });

  it("makes as many strings as asked, one per line", async () => {
    const { user } = await openTool();
    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "3");

    const lines = output().textContent!.split("\n");
    expect(lines).toHaveLength(3);
    expect(new Set(lines).size).toBe(3);
    for (const line of lines) {
      expect(line).toHaveLength(32);
      expect(NANO.test(line)).toBe(true);
    }
  });

  it("makes hex tokens in the hex mode", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Token hex" }));
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "33");

    expect(output().textContent).toMatch(HEX);
    expect(output().textContent).toHaveLength(33);
  });

  it("makes Base64URL tokens in the Base64URL mode", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Token Base64URL" }));
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "43");

    expect(output().textContent).toMatch(NANO);
    expect(output().textContent).toHaveLength(43);
    expect(output().textContent).not.toContain("=");
  });

  it("draws from the custom alphabet, and says clearly when it is wrong, and recovers", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Custom alphabet" }));
    const alphabet = screen.getByLabelText("Custom alphabet");

    await user.clear(alphabet);
    await user.type(alphabet, "ab");
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "20");
    expect(output().textContent).toMatch(/^[ab]{20}$/);

    await user.clear(alphabet);
    expect(screen.getByRole("alert")).toHaveTextContent("The alphabet cannot be empty");
    expect(output().textContent).toBe("");

    await user.type(alphabet, "aab");
    expect(screen.getByRole("alert")).toHaveTextContent("The alphabet has duplicate characters");

    await user.clear(alphabet);
    await user.type(alphabet, "abc");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(output().textContent).toMatch(/^[abc]{20}$/);
  });

  it("says clearly when the length or quantity is invalid, without crashing", async () => {
    const { user } = await openTool();

    await user.clear(screen.getByLabelText("Length"));
    expect(screen.getByRole("alert")).toHaveTextContent("Length must be a whole number from 1 to 1024");
    await user.type(screen.getByLabelText("Length"), "0");
    expect(screen.getByRole("alert")).toHaveTextContent("Length must be a whole number from 1 to 1024");

    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "8");
    await user.clear(screen.getByLabelText("Quantity"));
    expect(screen.getByRole("alert")).toHaveTextContent("Quantity must be a whole number from 1 to 100");

    await user.clear(screen.getByLabelText("Quantity"));
    await user.type(screen.getByLabelText("Quantity"), "2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(output().textContent!.split("\n")).toHaveLength(2);
  });

  it("stores the options as Preferences but never the generated strings", async () => {
    const { user, platform } = await openTool();
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "24");
    const generated = output().textContent!;

    const dump = JSON.stringify(platform.dump());
    expect(dump).toContain("random-string");
    expect(dump).toContain('"length":"24"');
    expect(dump).not.toContain(generated);
  });

  it("is in Vietnamese too", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Random String" }));

    expect(await screen.findByRole("button", { name: "Nano ID", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Độ dài")).toBeInTheDocument();
    expect(screen.getByLabelText("Số lượng")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bảng ký tự riêng" }));
    expect(screen.getByLabelText("Bảng ký tự")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo lại" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Bảng ký tự"));
    expect(screen.getByRole("alert")).toHaveTextContent("Bảng ký tự không được để trống");
  });
});
