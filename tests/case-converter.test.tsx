import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  const view = render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Case Converter" }));
  await screen.findByLabelText("Input");
  return { user, platform, unmount: view.unmount };
}

describe("Case Converter", () => {
  it("converts names to every case style as they are typed, with copy", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "getUser ID list");

    expect(screen.getByLabelText("camelCase")).toHaveValue("getUserIdList");
    expect(screen.getByLabelText("PascalCase")).toHaveValue("GetUserIdList");
    expect(screen.getByLabelText("snake_case")).toHaveValue("get_user_id_list");
    expect(screen.getByLabelText("kebab-case")).toHaveValue("get-user-id-list");
    expect(screen.getByLabelText("CONSTANT_CASE")).toHaveValue("GET_USER_ID_LIST");
    expect(screen.getByLabelText("Title Case")).toHaveValue("Get User Id List");

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("getUserIdList");
  });

  it("converts Vietnamese names without losing their diacritics", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "đà nẵng");
    expect(screen.getByLabelText("Title Case")).toHaveValue("Đà Nẵng");
    expect(screen.getByLabelText("kebab-case")).toHaveValue("đà-nẵng");
  });

  it("converts each line on its own", async () => {
    const { user } = await openTool();
    await user.type(screen.getByLabelText("Input"), "ninh bình{Enter}hồ chí minh");
    expect(screen.getByLabelText("snake_case")).toHaveValue("ninh_bình\nhồ_chí_minh");
  });

  it("builds a URL slug with the Vietnamese diacritics removed, đ included", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "URL Slug", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "Bài Viết Đầu Tiên!\nĐà Nẵng");

    expect(screen.getByLabelText("Output")).toHaveValue("bai-viet-dau-tien\nda-nang");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe("bai-viet-dau-tien\nda-nang");
  });

  it("shows a clear error for a slug with no letters or digits, without crashing, then recovers", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "URL Slug", pressed: false }));
    await user.type(screen.getByLabelText("Input"), "***");

    expect(screen.getByRole("alert")).toHaveTextContent("no letters or digits");
    expect(screen.getByLabelText("Output")).toHaveValue("");

    await user.clear(screen.getByLabelText("Input"));
    await user.type(screen.getByLabelText("Input"), "ok");
    expect(screen.getByLabelText("Output")).toHaveValue("ok");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps nothing: the Input and the results never reach the store", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US" });
    const { user, unmount } = await openTool(platform);
    await user.type(screen.getByLabelText("Input"), "in-memory-only");
    unmount();

    render(<App platform={platform} />);
    await user.click(await screen.findByRole("button", { name: "Case Converter" }));
    expect(await screen.findByLabelText("Input")).toHaveValue("");
    expect(JSON.stringify(platform.dump())).not.toContain("in-memory-only");
  });

  it("speaks Vietnamese", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Case Converter" }));
    expect(await screen.findByLabelText("Đầu vào")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đổi kiểu chữ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "URL Slug" })).toBeInTheDocument();
    expect(screen.getByLabelText("camelCase")).toBeInTheDocument();
  });
});
