import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "IP / CIDR Calculator" }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText("Input", {}, { timeout: 5000 });
  return { user, platform, unmount: view.unmount };
}

describe("IP / CIDR Calculator", () => {
  it("works out an IPv4 network as it is typed, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "192.168.1.10/24");

    expect(screen.getByLabelText("CIDR")).toHaveValue("192.168.1.0/24");
    expect(screen.getByLabelText("Network address")).toHaveValue("192.168.1.0");
    expect(screen.getByLabelText("Broadcast address")).toHaveValue("192.168.1.255");
    expect(screen.getByLabelText("First host")).toHaveValue("192.168.1.1");
    expect(screen.getByLabelText("Last host")).toHaveValue("192.168.1.254");
    expect(screen.getByLabelText("Usable hosts")).toHaveValue("254");
    expect(screen.getByLabelText("Netmask")).toHaveValue("255.255.255.0");
    expect(screen.getByLabelText("Wildcard mask")).toHaveValue("0.0.0.255");
    expect(screen.getByLabelText("Address type")).toHaveValue("Private");

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("192.168.1.0/24");
  });

  it("shows an IPv6 range by its addresses, without a broadcast", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "2001:db8:abcd:12::1/64");

    expect(screen.getByLabelText("CIDR")).toHaveValue("2001:db8:abcd:12::/64");
    expect(screen.getByLabelText("First address")).toHaveValue("2001:db8:abcd:12::");
    expect(screen.getByLabelText("Last address")).toHaveValue("2001:db8:abcd:12:ffff:ffff:ffff:ffff");
    expect(screen.getByLabelText("Addresses")).toHaveValue("18446744073709551616");
    expect(screen.getByLabelText("Address type")).toHaveValue("Documentation");
    expect(screen.queryByLabelText("Broadcast address")).not.toBeInTheDocument();
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "10.0.0.1/33");
    expect(screen.getByRole("alert")).toHaveTextContent("The prefix must be a whole number");
    expect(screen.queryByLabelText("CIDR")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "10.0.0.1/8");
    expect(screen.getByLabelText("CIDR")).toHaveValue("10.0.0.0/8");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("splits a network into subnets of the chosen prefix", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "10.0.0.0/24");
    expect(screen.getByLabelText("Subnets")).toHaveValue("10.0.0.0/25\n10.0.0.128/25");

    await user.click(screen.getByRole("combobox", { name: "New prefix" }));
    await user.click(await screen.findByRole("option", { name: "/26" }));
    expect(screen.getByLabelText("Subnets")).toHaveValue("10.0.0.0/26\n10.0.0.64/26\n10.0.0.128/26\n10.0.0.192/26");
    expect(screen.getByText("4 subnets of /26")).toBeInTheDocument();
  });

  it("lists only the first subnets of a huge split and says so", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "10.0.0.0/8");
    await user.click(screen.getByRole("combobox", { name: "New prefix" }));
    await user.click(await screen.findByRole("option", { name: "/32" }));
    expect(screen.getByText("Showing the first 1024 of 16777216 subnets")).toBeInTheDocument();
  });

  it("merges a list of networks and names the wrong line", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Merge", pressed: false }));
    const input = screen.getByLabelText("Input");
    await user.click(input);
    await user.paste("192.168.0.0/24\n192.168.1.0/24\n10.0.0.1");
    await waitFor(() => expect(screen.getByLabelText("Merged networks")).toHaveValue("10.0.0.1/32\n192.168.0.0/23"));
    expect(screen.getByText("3 entries merged into 2")).toBeInTheDocument();

    await user.paste("\nnope");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Line 4: This is not a valid IPv4 or IPv6 address"));
  });

  it("tells whether one network holds another", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Compare", pressed: false }));
    await user.type(screen.getByLabelText("Network A"), "10.0.0.0/8");
    await user.type(screen.getByLabelText("Network B"), "10.20.30.0/24");
    expect(screen.getByLabelText("Result")).toHaveValue("10.0.0.0/8 contains 10.20.30.0/24");

    await user.clear(screen.getByLabelText("Network B"));
    await user.type(screen.getByLabelText("Network B"), "2001:db8::/32");
    expect(screen.getByRole("alert")).toHaveTextContent("cannot hold each other");
  });

  it("opens with a pasted CIDR as its Input", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});
    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste("172.16.5.4/12");

    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /IP \/ CIDR Calculator/ }));
    await waitFor(() => expect(screen.getByLabelText("Input")).toHaveValue("172.16.5.4/12"), { timeout: 5000 });
    expect(screen.getByLabelText("CIDR")).toHaveValue("172.16.0.0/12");
  });

  it("keeps nothing: the Input and the results never reach the store", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Input"), "203.0.113.77/28");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "IP / CIDR Calculator" }));
    expect(await screen.findByLabelText("Input")).toHaveValue("");
    expect(JSON.stringify(platform.dump())).not.toContain("203.0.113");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Tính IP / CIDR" }));
    expect(await screen.findByLabelText("Đầu vào", {}, { timeout: 5000 })).toBeInTheDocument();
    for (const mode of ["Tính toán", "Chia", "Gộp", "So sánh"]) expect(screen.getByRole("button", { name: mode })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Đầu vào"), "10.0.0.0/33");
    expect(screen.getByRole("alert")).toHaveTextContent("Prefix phải là số nguyên");
    await user.clear(screen.getByLabelText("Đầu vào"));
    await user.type(screen.getByLabelText("Đầu vào"), "127.0.0.1");
    expect(screen.getByLabelText("Địa chỉ mạng")).toHaveValue("127.0.0.1");
    expect(screen.getByLabelText("Loại địa chỉ")).toHaveValue("Loopback");
  });
});
