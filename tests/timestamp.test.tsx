import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Timestamp Converter" }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText("Input", {}, { timeout: 5000 });
  return { user, platform, unmount: view.unmount };
}

describe("Timestamp Converter", () => {
  it("turns Unix seconds into every other form as it is typed, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "1700000000");

    expect(screen.getByText("Read as a Unix timestamp in seconds")).toBeInTheDocument();
    expect(screen.getByLabelText("Unix seconds")).toHaveValue("1700000000");
    expect(screen.getByLabelText("Unix milliseconds")).toHaveValue("1700000000000");
    expect(screen.getByLabelText("Unix microseconds")).toHaveValue("1700000000000000");
    expect(screen.getByLabelText("Unix nanoseconds")).toHaveValue("1700000000000000000");
    expect(screen.getByLabelText("ISO 8601 (UTC)")).toHaveValue("2023-11-14T22:13:20.000Z");

    await user.click(screen.getAllByRole("button", { name: "Copy" })[1]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("1700000000000");
  });

  it("tells milliseconds by size, and reads in the unit picked instead", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "1700000000123");
    expect(screen.getByText("Read as a Unix timestamp in milliseconds")).toBeInTheDocument();
    expect(screen.getByLabelText("ISO 8601 (UTC)")).toHaveValue("2023-11-14T22:13:20.123Z");

    await user.click(screen.getByRole("combobox", { name: "Unit" }));
    await user.click(screen.getByRole("option", { name: "Microseconds" }));
    expect(screen.getByLabelText("ISO 8601 (UTC)")).toHaveValue("1970-01-20T16:13:20.000123Z");
  });

  it("reads an ISO 8601 date and a sum like now - 1d", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "2023-11-15T05:13:20+07:00");
    expect(screen.getByText("Read as a date")).toBeInTheDocument();
    expect(screen.getByLabelText("Unix seconds")).toHaveValue("1700000000");

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "now - 1d");
    expect(screen.getByText("Read as the current time")).toBeInTheDocument();
    expect(screen.getByLabelText("Relative")).toHaveValue("yesterday");
  });

  it("fills in the current time on Now", async () => {
    const { user } = await openTool();
    const before = Math.floor(Date.now() / 1000);
    await user.click(screen.getByRole("button", { name: "Now" }));
    const seconds = Number((screen.getByLabelText("Input") as HTMLInputElement).value);
    expect(seconds).toBeGreaterThanOrEqual(before);
    expect(seconds).toBeLessThanOrEqual(before + 5);
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "2023-02-30");
    expect(screen.getByRole("alert")).toHaveTextContent("This day does not exist in that month");
    expect(screen.queryByLabelText("Unix seconds")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "next tuesday");
    expect(screen.getByRole("alert")).toHaveTextContent("Type a Unix timestamp");

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "0");
    expect(screen.getByLabelText("ISO 8601 (UTC)")).toHaveValue("1970-01-01T00:00:00.000Z");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the local zone, and remembers added zones as a Preference", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Input"), "1700000000");
    const zones = screen.getByRole("region", { name: "Time zones" });
    expect(within(zones).getByLabelText(/\(this computer\)$/)).toBeInTheDocument();

    const add = screen.getByLabelText("Time zone to add");
    await user.click(add);
    await user.paste("Mars/Olympus");
    await user.keyboard("{Enter}");
    expect(within(zones).getByRole("alert")).toHaveTextContent("There is no time zone named Mars/Olympus");

    await user.clear(add);
    await user.paste("asia/tokyo");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(within(zones).getByLabelText("Asia/Tokyo")).toHaveValue("2023-11-15T07:13:20.000+09:00");
    expect(within(zones).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(add);
    await user.paste("America/New_York");
    await user.keyboard("{Enter}");
    expect(within(zones).getByLabelText("America/New_York")).toHaveValue("2023-11-14T17:13:20.000-05:00");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Timestamp Converter" }));
    await user.type(await screen.findByLabelText("Input", {}, { timeout: 5000 }), "0");
    expect(screen.getByLabelText("Asia/Tokyo")).toHaveValue("1970-01-01T09:00:00.000+09:00");
    expect(screen.getByLabelText("America/New_York")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Asia/Tokyo" }));
    expect(screen.queryByLabelText("Asia/Tokyo")).not.toBeInTheDocument();
    expect(JSON.stringify(platform.dump())).not.toContain("Asia/Tokyo");
    expect(JSON.stringify(platform.dump())).toContain("America/New_York");
  });

  it("opens with a pasted ISO 8601 date as its Input", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});
    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste("2023-11-14T22:13:20Z");

    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /Timestamp Converter/ }));
    await waitFor(() => expect(screen.getByLabelText("Input")).toHaveValue("2023-11-14T22:13:20Z"), { timeout: 5000 });
    expect(screen.getByLabelText("Unix seconds")).toHaveValue("1700000000");
  });

  it("keeps nothing of the Input: it never reaches the store", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Input"), "1234567890");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Timestamp Converter" }));
    expect(await screen.findByLabelText("Input")).toHaveValue("");
    expect(JSON.stringify(platform.dump())).not.toContain("1234567890");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Chuyển đổi Timestamp" }));
    expect(await screen.findByLabelText("Đầu vào", {}, { timeout: 5000 })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Đầu vào"), "abc");
    expect(screen.getByRole("alert")).toHaveTextContent("Hãy nhập Unix timestamp");
    await user.clear(screen.getByLabelText("Đầu vào"));
    await user.type(screen.getByLabelText("Đầu vào"), "1700000000");
    expect(screen.getByText("Đọc là Unix timestamp tính bằng giây")).toBeInTheDocument();
    expect(screen.getByLabelText("Unix mili giây")).toHaveValue("1700000000000");
    expect(screen.getByRole("region", { name: "Múi giờ" })).toBeInTheDocument();
  });
});
