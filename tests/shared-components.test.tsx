import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { FileDropZone } from "@/components/file-drop-zone";
import { ResultRow } from "@/components/result-row";
import { createI18n } from "@/i18n";
import type { Locale } from "@/lib/tool";

async function renderWithI18n(ui: ReactElement, locale: Locale = "en") {
  const i18n = await createI18n(locale);
  const user = userEvent.setup();
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
  return { user };
}

describe("CopyButton", () => {
  it("copies its text and says so", async () => {
    const { user } = await renderWithI18n(<CopyButton value="Zm9vYmFy" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(await navigator.clipboard.readText()).toBe("Zm9vYmFy");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });

  it("works from the keyboard, copying the value as it is when pressed", async () => {
    let value = "first";
    const { user } = await renderWithI18n(<CopyButton value={() => value} />);
    value = "second";
    screen.getByRole("button", { name: "Copy" }).focus();
    await user.keyboard("{Enter}");
    expect(await navigator.clipboard.readText()).toBe("second");
  });

  it("says so when the clipboard refuses", async () => {
    const { user } = await renderWithI18n(<CopyButton value="x" />, "vi");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Sao chép" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Không sao chép được");
  });

  it("tells its owner once the text is on the clipboard, and not when the copy failed", async () => {
    const onCopied = vi.fn();
    const { user } = await renderWithI18n(<ResultRow label="Hex" value="#ff0000" onCopied={onCopied} />);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("status")).toHaveTextContent("the clipboard refused it");
    expect(onCopied).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(onCopied).toHaveBeenCalledOnce();
  });
});

describe("FileDropZone", () => {
  const file = new File(["hello"], "hello.txt", { type: "text/plain" });

  it("takes a file dropped on it", async () => {
    const onFile = vi.fn();
    await renderWithI18n(<FileDropZone label="File to encode" onFile={onFile} />);
    const zone = screen.getByRole("group", { name: "File to encode" });

    fireEvent.dragOver(zone, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(zone).toHaveAttribute("data-dragging");
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ["Files"] } });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(zone).not.toHaveAttribute("data-dragging");
  });

  it("lets a keyboard user choose a file instead", async () => {
    const onFile = vi.fn();
    const { user } = await renderWithI18n(<FileDropZone label="File to encode" onFile={onFile} />);
    const choose = screen.getByRole("button", { name: "Choose a file" });
    choose.focus();
    expect(choose).toHaveFocus();

    await user.upload(screen.getByLabelText("File to encode", { selector: "input" }), file);
    expect(onFile).toHaveBeenCalledWith(file);
  });
});

describe("ErrorMessage", () => {
  it("is announced as an alert", async () => {
    await renderWithI18n(<ErrorMessage>Input is not valid Base64</ErrorMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Input is not valid Base64");
  });
});

describe("ResultRow", () => {
  it("shows a labelled read-only result that copies", async () => {
    const { user } = await renderWithI18n(<ResultRow label="Netmask" value="255.255.255.0" note="A /24 network" />);
    const field = screen.getByLabelText("Netmask");
    expect(field).toHaveValue("255.255.255.0");
    expect(field).toHaveAttribute("readonly");
    expect(field.tagName).toBe("INPUT");
    expect(screen.getByText("A /24 network")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("255.255.255.0");
  });

  it("shows a dash with nothing to copy when there is no value", async () => {
    await renderWithI18n(<ResultRow label="Roman numerals" value={null} />);
    expect(screen.getByLabelText("Roman numerals")).toHaveValue("—");
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });

  it("puts a control beside the copy button, and spans lines when asked", async () => {
    await renderWithI18n(<ResultRow label="Binary" value={"1010"} multiline action={<button type="button">Width</button>} />);
    expect(screen.getByLabelText("Binary").tagName).toBe("TEXTAREA");
    expect(screen.getByRole("button", { name: "Width" })).toBeInTheDocument();
  });
});
