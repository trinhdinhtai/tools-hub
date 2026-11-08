import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "UUID Generator" }));
  await screen.findByLabelText("How many");
  return { user, platform };
}

function row(id: string) {
  return screen.getByText(id).closest("li")!;
}

function outputList() {
  return screen.getByRole("list", { name: "IDs" });
}

describe("UUID Generator", () => {
  it("generates v4 IDs, one per requested count, each with a copy button", async () => {
    const { user } = await openTool();
    await user.clear(screen.getByLabelText("How many"));
    await user.type(screen.getByLabelText("How many"), "3");

    const rows = within(outputList()).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(within(row).getByText(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    }
  });

  it("generates v5 from a name and the namespace, matching the RFC vector", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "V5" }));
    await user.type(screen.getByLabelText("Name"), "www.example.com");

    expect(within(outputList()).getAllByRole("listitem")).toHaveLength(1);
    expect(row("2ed6657d-e927-568b-95e1-2665a8aea6a2")).toBeInTheDocument();
  });

  it("asks for a name instead of failing silently", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "V5" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name for v3 and v5");
    expect(screen.queryByRole("list", { name: "IDs" })).not.toBeInTheDocument();
  });

  it("copies a generated ID to the clipboard", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "V5" }));
    await user.type(screen.getByLabelText("Name"), "www.example.com");
    await user.click(within(row("2ed6657d-e927-568b-95e1-2665a8aea6a2")).getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("keeps the generated IDs when the user switches Mode and back", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "V5" }));
    await user.type(screen.getByLabelText("Name"), "www.example.com");
    expect(row("2ed6657d-e927-568b-95e1-2665a8aea6a2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(row("2ed6657d-e927-568b-95e1-2665a8aea6a2")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("www.example.com");
  });

  it("shows the version, variant and timestamp of a pasted UUID", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await user.type(screen.getByLabelText("UUID or ULID"), "017f22e2-79b0-7cc3-98c4-dc0c0c07398f");

    const details = screen.getByRole("list", { name: "Details" });
    expect(within(details).getByText("UUID")).toBeInTheDocument();
    expect(within(details).getByText("v7")).toBeInTheDocument();
    expect(within(details).getByText("RFC 4122 / RFC 9562")).toBeInTheDocument();
    expect(within(details).getByText("1645557742000 ms")).toBeInTheDocument();
  });

  it("says clearly when the Input is not an ID", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await user.type(screen.getByLabelText("UUID or ULID"), "not an id 🌍");

    expect(screen.getByRole("alert")).toHaveTextContent("That is not a UUID or a ULID");
    expect(screen.queryByRole("list", { name: "Details" })).not.toBeInTheDocument();
  });

  it("reads a pasted ULID, case-insensitively", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await user.type(screen.getByLabelText("UUID or ULID"), "01arz3ndektsv4rrffq69g5fav");

    const details = screen.getByRole("list", { name: "Details" });
    expect(within(details).getByText("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBeInTheDocument();
    expect(within(details).getByText("ULID")).toBeInTheDocument();
  });

  it("is in Vietnamese too", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "UUID Generator" }));

    expect(await screen.findByRole("button", { name: "Tạo", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Số lượng")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Xem chi tiết" }));
    expect(screen.getByLabelText("UUID hoặc ULID")).toBeInTheDocument();
  });
});
