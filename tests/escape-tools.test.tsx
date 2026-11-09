import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openEscapeTools(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Escape Tools" }));
  const input = await screen.findByRole("textbox", { name: /^(Input|Dữ liệu nhập)$/ });
  return { user, platform, input };
}

const output = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: /^(Output|Kết quả)$/ });

describe("Escape Tools", () => {
  it("escapes HTML as the Input is typed, and copies the result", async () => {
    const { user, input } = await openEscapeTools();
    await user.click(input);
    await user.paste(`<a href="x">Tôi & bạn</a>`);

    expect(output().value).toBe("&lt;a href=&quot;x&quot;&gt;Tôi &amp; bạn&lt;/a&gt;");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("&lt;a href=&quot;x&quot;&gt;Tôi &amp; bạn&lt;/a&gt;");
  });

  it("switches Mode and direction", async () => {
    const { user, input } = await openEscapeTools();
    await user.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Punycode" }));
    await user.click(input);
    await user.paste("münchen.de");
    expect(output().value).toBe("xn--mnchen-3ya.de");

    await user.click(screen.getByRole("button", { name: "To Unicode" }));
    await user.clear(input);
    await user.paste("xn--tingvit-5t4cyc.vn");
    expect(output().value).toBe("tiếngviệt.vn");

    await user.click(within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Backslash" }));
    await user.clear(input);
    await user.paste("a\\tb\\u00e9");
    expect(output().value).toBe("a\tbé");
  });

  it("says what is wrong with the Input, in the interface language", async () => {
    const { user, input } = await openEscapeTools(createMemoryPlatform({ osLocale: "vi-VN" }));
    await user.click(screen.getByRole("button", { name: "Unescape" }));
    await user.click(input);
    await user.paste("a &nope; b");

    expect(screen.getByRole("alert")).toHaveTextContent("Không có HTML entity nào tên &nope;");
    expect(output().value).toBe("");
    expect(screen.queryByRole("button", { name: "Sao chép" })).not.toBeInTheDocument();
  });

  it("never stores the Input", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, input } = await openEscapeTools(platform);
    await user.click(input);
    await user.paste("hunter2-secret");

    expect(output().value).toBe("hunter2-secret");
    expect(JSON.stringify(platform.dump())).not.toContain("hunter2");
  });
});
