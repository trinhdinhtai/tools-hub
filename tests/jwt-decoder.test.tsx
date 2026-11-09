import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

/** Base64url of a text's UTF-8, without padding. */
function b64url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const token = (payload: object) => `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.c2lnbmF0dXJl`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

const editorText = (name: string) => EditorView.findFromDOM(screen.getByRole("textbox", { name }))!.state.doc.toString();

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" }), name = "JWT Decoder", input = "Token") {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name }));
  // The Tool component and its namespace load lazily; give them longer than the default second under load.
  await screen.findByLabelText(input, {}, { timeout: 5000 });
  return { user, platform, unmount: view.unmount };
}

async function enter(user: ReturnType<typeof userEvent.setup>, text: string, label = "Token") {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.click(field);
  await user.paste(text);
}

describe("JWT Decoder", () => {
  it("decodes the header and payload, with copy", async () => {
    const { user } = await openTool();
    await enter(user, `Bearer ${token({ sub: "42", name: "Tài" })}`);

    expect(JSON.parse(editorText("Header"))).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(editorText("Payload"))).toEqual({ sub: "42", name: "Tài" });
    expect(screen.getByLabelText("Signature")).toHaveValue("c2lnbmF0dXJl");
    expect(screen.getByText(/Active, never expires/)).toBeInTheDocument();

    await user.click(within(screen.getByRole("region", { name: "Payload" })).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(JSON.parse(await navigator.clipboard.readText())).toEqual({ sub: "42", name: "Tài" });
  });

  it("shows when it expires, and whether it is active, expired or not valid yet", async () => {
    const { user } = await openTool();
    const now = nowSeconds();
    await enter(user, token({ iat: now, exp: now + 2 * 3600 }));
    expect(screen.getByText(/Active, expires in 2 hours/)).toBeInTheDocument();
    expect(screen.getByLabelText("Expires (exp)")).toHaveValue(new Date((now + 2 * 3600) * 1000).toISOString());
    expect(screen.getByLabelText("Issued at (iat)")).toHaveValue(new Date(now * 1000).toISOString());

    await enter(user, token({ exp: now - 3 * 86_400 }));
    expect(screen.getByText(/Expired 3 days ago/)).toBeInTheDocument();

    await enter(user, token({ nbf: now + 600, exp: now + 3600 }));
    expect(screen.getByText(/Not valid yet, starts in 10 minutes/)).toBeInTheDocument();
    expect(screen.getByLabelText("Not before (nbf)")).toBeInTheDocument();

    await enter(user, token({ exp: "tomorrow" }));
    expect(screen.getByText(/exp is not a NumericDate/)).toBeInTheDocument();
    expect(screen.getByLabelText("Expires (exp)")).toHaveValue('"tomorrow"');
  });

  it("shows a clear error for invalid input, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await enter(user, "not-a-token");
    expect(screen.getByRole("alert")).toHaveTextContent("A JWT has three parts separated by dots");
    expect(screen.queryByRole("textbox", { name: "Payload" })).not.toBeInTheDocument();

    await enter(user, `${b64url('{"alg":"none"}')}.${b64url("{oops")}.`);
    expect(screen.getByRole("alert")).toHaveTextContent("The payload is not valid JSON");

    await enter(user, `${token({ sub: "1" })} and more`);
    expect(screen.getByRole("alert")).toHaveTextContent("The token has a space in it");

    await enter(user, token({ sub: "1" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(JSON.parse(editorText("Payload"))).toEqual({ sub: "1" });
  });

  it("opens with a pasted JWT as its Input", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "en-US" })} />);
    await screen.findByRole("navigation", { name: "Tools" });
    await act(async () => {});
    (document.activeElement as HTMLElement | null)?.blur();
    const pasted = token({ sub: "pasted" });
    await user.paste(pasted);

    const dialog = await screen.findByRole("dialog", { name: "Open with" });
    await user.click(within(dialog).getByRole("option", { name: /JWT Decoder/ }));
    await waitFor(() => expect(screen.getByLabelText("Token")).toHaveValue(pasted), { timeout: 5000 });
    expect(JSON.parse(editorText("Payload"))).toEqual({ sub: "pasted" });
  });

  it("keeps nothing of the Input: it never reaches the store", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    const secret = token({ sub: "do-not-store-me" });
    await enter(user, secret);
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "JWT Decoder" }));
    expect(await screen.findByLabelText("Token", {}, { timeout: 5000 })).toHaveValue("");
    expect(JSON.stringify(platform.dump())).not.toContain(secret);
  });

  it("speaks Vietnamese", async () => {
    const { user } = await openTool(createMemoryPlatform({ osLocale: "vi-VN" }), "Giải mã JWT", "Token");
    await enter(user, "a.b");
    expect(screen.getByRole("alert")).toHaveTextContent("JWT gồm ba phần cách nhau bởi dấu chấm");
    await enter(user, token({ exp: nowSeconds() - 3 * 86_400 }));
    expect(screen.getByText(/Đã hết hạn 3 ngày trước/)).toBeInTheDocument();
    expect(screen.getByLabelText("Hết hạn (exp)")).toBeInTheDocument();
  });
});
