import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";
import { handleFileJob } from "@/tools/hash-generator/file-jobs";
import { digestsOf } from "@/tools/hash-generator/logic";
import { inlineWorker } from "./inline-worker";

beforeEach(() => {
  vi.stubGlobal("Worker", inlineWorker(handleFileJob));
});

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Hash Generator" }));
  await screen.findByRole("textbox", { name: "Input" });
  return { user, platform };
}

function row(algorithm: string) {
  return screen.getByText(algorithm, { exact: true }).closest("li")!;
}

function drop(file: File) {
  const zone = screen.getByRole("group", { name: "File to hash" });
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });
}

describe("Hash Generator", () => {
  it("hashes typed text as UTF-8", async () => {
    const { user } = await openTool();
    await user.type(screen.getByRole("textbox", { name: "Input" }), "abc");

    expect(within(row("SHA-256")).getByText(/ba7816bf8f01cfea/)).toBeInTheDocument();
    expect(within(row("MD5")).getByText(/900150983cd24fb0/)).toBeInTheDocument();
  });

  it("computes an HMAC when a key is given, and a plain hash when it is empty", async () => {
    const { user } = await openTool();
    await user.type(screen.getByRole("textbox", { name: "Input" }), "what do ya want for nothing?");
    await user.type(screen.getByLabelText("HMAC key"), "Jefe");

    expect(within(row("SHA-256")).getByText(/5bdcc146bf60754e/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText("HMAC key"));
    expect(within(row("SHA-256")).queryByText(/5bdcc146bf60754e/)).not.toBeInTheDocument();
    expect(within(row("SHA-256")).getByText(digestsOf(new TextEncoder().encode("what do ya want for nothing?"), null)["sha-256"]))
      .toBeInTheDocument();
  });

  it("hashes a dropped file through the worker", async () => {
    const { user } = await openTool();
    await user.click(await screen.findByRole("button", { name: "File" }));
    drop(new File(["hello"], "hello.txt", { type: "text/plain" }));

    const expected = digestsOf(new TextEncoder().encode("hello"), null);
    await vi.waitFor(() => expect(within(row("SHA-256")).getByText(expected["sha-256"])).toBeInTheDocument());
    expect(within(row("MD5")).getByText(expected["md5"])).toBeInTheDocument();
  });

  it("hashes a dropped file as HMAC when a key is typed", async () => {
    const { user } = await openTool();
    await user.click(await screen.findByRole("button", { name: "File" }));
    await user.type(screen.getByLabelText("HMAC key"), "Jefe");
    drop(new File(["what do ya want for nothing?"], "note.txt"));

    await vi.waitFor(() =>
      expect(within(row("SHA-256")).getByText(/5bdcc146bf60754e/)).toBeInTheDocument(),
    );
  });

  it("copies a digest to the clipboard", async () => {
    const { user } = await openTool();
    await user.type(screen.getByRole("textbox", { name: "Input" }), "abc");
    await user.click(within(row("MD5")).getByRole("button", { name: "Copy" }));

    await vi.waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("is in Vietnamese too", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Hash Generator" }));

    expect(await screen.findByRole("button", { name: "Văn bản", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Dữ liệu nhập" })).toBeInTheDocument();
    expect(screen.getByLabelText("Khoá HMAC")).toBeInTheDocument();
  });
});
