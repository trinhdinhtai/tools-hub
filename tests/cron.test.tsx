import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Cron Calculator" }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText("Cron expression", {}, { timeout: 5000 });
  return { user, platform, unmount: view.unmount };
}

const lines = (element: HTMLElement) => (element as HTMLTextAreaElement).value.split("\n");

describe("Cron Calculator", () => {
  it("explains an expression, field by field, as it is typed, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Cron expression"), "*/15 9-17 * * 1-5");

    expect(screen.getByLabelText("In words")).toHaveValue("Every 15 minutes, between 09:00 and 17:59, Monday through Friday");
    const fields = screen.getByRole("region", { name: "Fields" });
    const minute = within(fields).getByRole("row", { name: /^Minute/ });
    expect(minute).toHaveTextContent("*/15");
    expect(minute).toHaveTextContent("0, 15, 30, 45");
    expect(within(fields).getByRole("row", { name: /^Hour/ })).toHaveTextContent("9–17");
    expect(within(fields).getByRole("row", { name: /^Day of month/ })).toHaveTextContent("Any");
    expect(within(fields).getByRole("row", { name: /^Weekday/ })).toHaveTextContent("Mon–Fri");

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("Every 15 minutes, between 09:00 and 17:59, Monday through Friday");
  });

  it("lists the next ten runs in the zone picked, and remembers the zone", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Cron expression"), "30 9 * * *");
    const runs = screen.getByRole("region", { name: "Next runs" });

    const zone = within(runs).getByLabelText("Time zone");
    await user.type(zone, "Mars/Olympus");
    expect(within(runs).getByRole("alert")).toHaveTextContent("There is no time zone named Mars/Olympus");

    await user.clear(zone);
    await user.type(zone, "Asia/Tokyo");
    expect(within(runs).queryByRole("alert")).not.toBeInTheDocument();
    const list = within(runs).getByLabelText("Next 10 runs");
    expect(lines(list)).toHaveLength(10);
    for (const line of lines(list)) expect(line).toMatch(/^\d{4}-\d{2}-\d{2} 09:30 \+09:00 \w{3}$/);

    await user.click(within(runs).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(within(runs).getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect((await navigator.clipboard.readText()).split("\n")).toHaveLength(10);
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Cron Calculator" }));
    await user.type(await screen.findByLabelText("Cron expression", {}, { timeout: 5000 }), "@daily");
    expect(screen.getByText("@daily is short for 0 0 * * *")).toBeInTheDocument();
    expect(screen.getByLabelText("Time zone")).toHaveValue("Asia/Tokyo");
    expect(lines(screen.getByLabelText("Next 10 runs"))[0]).toMatch(/ 00:00 \+09:00 /);
    expect(JSON.stringify(platform.dump())).not.toContain("@daily");
  });

  it("says when a schedule never runs", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Cron expression"), "0 0 30 2 *");
    expect(screen.getByText("This schedule does not run in the next 50 years")).toBeInTheDocument();
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    const input = screen.getByLabelText("Cron expression");
    await user.type(input, "* * * *");
    expect(screen.getByRole("alert")).toHaveTextContent("A cron expression has 5 fields: minute, hour, day of month, month and weekday. This one has 4");
    expect(screen.queryByLabelText("In words")).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "0 24 * * *");
    expect(screen.getByRole("alert")).toHaveTextContent("Hour: 24 is outside 0 to 23");

    await user.clear(input);
    await user.type(input, "0 9 * * *");
    expect(screen.getByLabelText("In words")).toHaveValue("At 09:00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens with a pasted cron expression as its Input", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});
    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste("*/5 * * * *");

    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /Cron Calculator/ }));
    await waitFor(() => expect(screen.getByLabelText("Cron expression")).toHaveValue("*/5 * * * *"), { timeout: 5000 });
    expect(screen.getByLabelText("In words")).toHaveValue("Every 5 minutes");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Tính lịch Cron" }));
    const input = await screen.findByLabelText("Biểu thức cron", {}, { timeout: 5000 });
    await user.type(input, "0 0 * 13 *");
    expect(screen.getByRole("alert")).toHaveTextContent("Tháng: 13 nằm ngoài khoảng 1 đến 12");

    await user.clear(input);
    await user.type(input, "0 22 * * 1,3,5");
    expect(screen.getByLabelText("Bằng lời")).toHaveValue("Lúc 22:00, vào Thứ Hai, Thứ Tư và Thứ Sáu");
    expect(screen.getByRole("region", { name: "Các trường" })).toBeInTheDocument();
    expect(screen.getByLabelText("10 lần chạy kế tiếp")).toBeInTheDocument();
  });
});
