import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";
import { handleFileJob } from "@/tools/base64/file-jobs";
import { inlineWorker } from "./inline-worker";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

beforeEach(() => {
  vi.stubGlobal("Worker", inlineWorker(handleFileJob));
});

async function openFileMode(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Base64" }));
  await user.click(await screen.findByRole("button", { name: "File" }));
  return { user, platform };
}

function drop(file: File) {
  const zone = screen.getByRole("group", { name: "File to encode" });
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });
}

const editorText = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!.state.doc.toString();

function typeInto(name: string, text: string) {
  const view = EditorView.findFromDOM(screen.getByRole("textbox", { name }))!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: "input.paste" }));
}

describe("Base64 File Mode", () => {
  it("encodes a dropped file, and copies or saves the result", async () => {
    const { user, platform } = await openFileMode();
    drop(new File(["hello"], "hello.txt", { type: "text/plain" }));

    expect(await screen.findByText(/hello\.txt/)).toBeInTheDocument();
    await vi.waitFor(() => expect(editorText("Output")).toBe("aGVsbG8="));

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("aGVsbG8=");

    await user.click(screen.getByRole("button", { name: "Save as file" }));
    const [saved] = platform.savedFiles();
    expect(saved?.name).toBe("hello.base64.txt");
    expect(new TextDecoder().decode(saved?.bytes)).toBe("aGVsbG8=");
  });

  it("encodes a file as a data URI with its MIME type", async () => {
    const { user } = await openFileMode();
    await user.click(screen.getByRole("switch", { name: "Data URI" }));
    drop(new File([new Uint8Array(PNG_SIGNATURE)], "dot.png", { type: "image/png" }));

    await vi.waitFor(() => expect(editorText("Output")).toBe("data:image/png;base64,iVBORw0KGgo="));
  });

  it("decodes a pasted data URI to a file named for its MIME type", async () => {
    const { user, platform } = await openFileMode();
    await user.click(screen.getByRole("button", { name: "Decode" }));
    typeInto("Input", "data:image/png;base64,iVBORw0KGgo=");

    expect(await screen.findByText(/image\/png/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save as file" }));
    const [saved] = platform.savedFiles();
    expect(saved?.name).toBe("decoded.png");
    expect([...saved!.bytes]).toEqual(PNG_SIGNATURE);
  });

  it("decodes plain Base64 to bytes that need not be text", async () => {
    const { user, platform } = await openFileMode();
    await user.click(screen.getByRole("button", { name: "Decode" }));
    typeInto("Input", "//4AgD8=");

    await user.click(await screen.findByRole("button", { name: "Save as file" }));
    expect([...platform.savedFiles()[0]!.bytes]).toEqual([0xff, 0xfe, 0x00, 0x80, 0x3f]);
    expect(platform.savedFiles()[0]!.name).toBe("decoded.bin");
  });

  it("says why Input cannot be decoded", async () => {
    const { user } = await openFileMode();
    await user.click(screen.getByRole("button", { name: "Decode" }));
    typeInto("Input", "Zm9v!A==");

    expect(await screen.findByRole("alert")).toHaveTextContent(/outside the alphabet/);
    expect(screen.queryByRole("button", { name: "Save as file" })).not.toBeInTheDocument();
  });

  it("saves nothing when the user cancels the save dialog", async () => {
    const { user, platform } = await openFileMode();
    platform.setSaveDialog("cancel");
    drop(new File(["hello"], "hello.txt"));
    await user.click(await screen.findByRole("button", { name: "Save as file" }));
    expect(platform.savedFiles()).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is in Vietnamese too", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Base64" }));
    await user.click(await screen.findByRole("button", { name: "File" }));
    const zone = screen.getByRole("group", { name: "File cần mã hoá" });
    expect(within(zone).getByRole("button", { name: "Chọn file" })).toBeInTheDocument();
  });

  it("opens a data URI pasted on the app in File Mode, ready to save", async () => {
    const user = userEvent.setup();
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    render(<App platform={platform} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});

    (document.activeElement as HTMLElement | null)?.blur();
    await user.paste("data:image/png;base64,iVBORw0KGgo=");
    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /Base64/ }));

    expect(await screen.findByRole("button", { name: "File", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decode", pressed: true })).toBeInTheDocument();
    await vi.waitFor(() => expect(editorText("Input")).toBe("data:image/png;base64,iVBORw0KGgo="));
    await user.click(await screen.findByRole("button", { name: "Save as file" }));
    expect(platform.savedFiles()[0]?.name).toBe("decoded.png");
  });
});
