import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

const URL = "https://example.com/search?q=hello%20world&lang=vi#top";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "URL Encoder" }));
  await screen.findByLabelText("Input");
  return { user, platform, unmount: view.unmount };
}

describe("URL Encoder", () => {
  it("encodes a whole URL, keeping its structure, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "https://example.com/a b?x=1");
    expect(screen.getByLabelText("Output")).toHaveValue("https://example.com/a%20b?x=1");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("https://example.com/a%20b?x=1");
  });

  it("decodes by scope: whole URL or single component", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Decode", pressed: false }));

    await user.type(screen.getByLabelText("Input"), "a%20b%2Fc%3Fd%3De");
    // Full: unreserved escapes decode, the reserved ones (%2F, %3D) stay encoded.
    expect(screen.getByLabelText("Output")).toHaveValue("a b%2Fc%3Fd%3De");

    await user.click(screen.getByRole("button", { name: "Component", pressed: false }));
    expect(screen.getByLabelText("Output")).toHaveValue("a b/c?d=e");
  });

  it("encodes Vietnamese text by its UTF-8 bytes", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Component", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "tiếng");
    expect(screen.getByLabelText("Output")).toHaveValue("ti%E1%BA%BFng");
  });

  it("shows a clear error for Input that does not decode, without crashing", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Decode", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "%zz");

    expect(screen.getByRole("alert")).toHaveTextContent("an escape like %A or %zz cannot be decoded");
    expect(screen.getByLabelText("Output")).toHaveValue("");
  });

  it("splits a URL into editable parts and reassembles it unchanged", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split URL", pressed: false }));
    await user.type(screen.getByLabelText("Input"), URL);

    expect(screen.getByLabelText("Scheme")).toHaveValue("https");
    expect(screen.getByLabelText("Host")).toHaveValue("example.com");
    expect(screen.getByLabelText("Path")).toHaveValue("/search");
    expect(screen.getByLabelText("Fragment")).toHaveValue("top");
    expect(screen.getByLabelText("Name 1")).toHaveValue("q");
    expect(screen.getByLabelText("Value 1")).toHaveValue("hello world");
    expect(screen.getByLabelText("Name 2")).toHaveValue("lang");
    expect(screen.getByLabelText("Output")).toHaveValue(URL);
  });

  it("reassembles the URL correctly after one query param is edited", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split URL", pressed: false }));
    await user.type(screen.getByLabelText("Input"), URL);

    await user.clear(screen.getByLabelText("Value 1"));
    await user.type(screen.getByLabelText("Value 1"), "a b&c");
    expect(screen.getByLabelText("Output")).toHaveValue("https://example.com/search?q=a%20b%26c&lang=vi#top");
  });

  it("removes and adds query params", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split URL", pressed: false }));
    await user.type(screen.getByLabelText("Input"), URL);

    await user.click(screen.getAllByRole("button", { name: "Remove param" })[0]!);
    expect(screen.getByLabelText("Output")).toHaveValue("https://example.com/search?lang=vi#top");

    await user.click(screen.getByRole("button", { name: "Add param" }));
    await user.type(screen.getByLabelText("Name 2"), "page");
    await user.type(screen.getByLabelText("Value 2"), "2");
    expect(screen.getByLabelText("Output")).toHaveValue("https://example.com/search?lang=vi&page=2#top");
  });

  it("reassembles a typed port into the URL", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split URL", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "https://example.com/a?q=1");

    await user.type(screen.getByLabelText("Port"), "8443");
    expect(screen.getByLabelText("Output")).toHaveValue("https://example.com:8443/a?q=1");
  });

  it("shows a clear error for Input that is not a URL, then recovers", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Split URL", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "example.com/no-scheme");

    expect(screen.getByRole("alert")).toHaveTextContent("This is not a URL");
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "https://example.com");
    expect(screen.getByLabelText("Host")).toHaveValue("example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is suggested for a pasted URL and opens it in Split mode", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste(URL);

    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /URL Encoder/ }));

    await waitFor(() => expect(screen.getByLabelText("Input")).toHaveValue(URL));
    expect(screen.getByRole("button", { name: "Split URL", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Host")).toHaveValue("example.com");
  });

  it("keeps the scope across restarts but never the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.click(screen.getByRole("button", { name: "Component", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "in-memory-only");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "URL Encoder" }));
    expect(await screen.findByLabelText("Input")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Component", pressed: true })).toBeInTheDocument();
    expect(JSON.stringify(platform.dump())).not.toContain("in-memory-only");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "URL Encoder" }));
    expect(await screen.findByLabelText("Đầu vào")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mã hoá / Giải mã" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tách URL" })).toBeInTheDocument();
  });
});
