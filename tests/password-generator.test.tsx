import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

const POOL = /[a-zA-Z0-9!@#$%^&*()\-_=+[\]{};:,.?/]/;

async function openTool(platform: MemoryPlatform = createMemoryPlatform({ osLocale: "en-US" })) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Password Generator" }));
  await screen.findByLabelText("Length");
  return { user, platform };
}

/** The generated value: the labelled output span. */
function output(label: string) {
  return screen.getByLabelText(label);
}

async function chooseOption(user: ReturnType<typeof userEvent.setup>, triggerLabel: string, name: string) {
  await user.click(screen.getByRole("combobox", { name: triggerLabel }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("Password Generator", () => {
  it("generates a password from every group, of the asked length, with copy", async () => {
    const { user } = await openTool();
    const first = output("Password").textContent!;
    expect(first).toHaveLength(20);
    expect([...first].every((char) => POOL.test(char))).toBe(true);

    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "30");
    expect(output("Password").textContent).toHaveLength(30);
    expect(output("Password").textContent).not.toBe(first);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Copied" }).length).toBeGreaterThan(0));
    expect(await navigator.clipboard.readText()).toBe(output("Password").textContent);
  });

  it("re-rolls on Generate without changing any option", async () => {
    const { user } = await openTool();
    const first = output("Password").textContent!;
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(output("Password").textContent).not.toBe(first);
  });

  it("keeps only the selected groups in the result", async () => {
    const { user } = await openTool();
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "40");
    for (const group of ["A–Z", "0–9", "!@#…"]) await user.click(screen.getByRole("button", { name: group }));

    expect(output("Password").textContent).toMatch(/^[a-z]{40}$/);
  });

  it("says clearly when the Input is invalid, and recovers, without crashing", async () => {
    const { user } = await openTool();

    // An empty Length, then a too small one: both are wrong, the last generated password is gone.
    await user.clear(screen.getByLabelText("Length"));
    expect(screen.getByRole("alert")).toHaveTextContent("Length must be a whole number from 4 to 256");
    await user.type(screen.getByLabelText("Length"), "2");
    expect(screen.getByRole("alert")).toHaveTextContent("Length must be a whole number from 4 to 256");
    expect(output("Password").textContent).toBe("");

    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "8");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(output("Password").textContent).toHaveLength(8);
  });

  it("asks for at least one character group", async () => {
    const { user } = await openTool();
    for (const group of ["a–z", "A–Z", "0–9", "!@#…"]) await user.click(screen.getByRole("button", { name: group }));

    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one character group");
    expect(output("Password").textContent).toBe("");

    await user.click(screen.getByRole("button", { name: "A–Z" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(output("Password").textContent).toMatch(/^[A-Z]{20}$/);
  });

  it("leaves out look-alike characters when asked", async () => {
    const { user } = await openTool();
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "40");
    await user.click(screen.getByRole("switch", { name: "Avoid look-alikes (I l 1 O 0 o)" }));

    expect([...output("Password").textContent!].some((char) => "Il1|O0o".includes(char))).toBe(false);
  });

  it("shows the strength of the password, and it grows with length", async () => {
    const { user } = await openTool();
    const meter = screen.getByRole("meter", { name: "Strength" });
    expect(meter).toHaveAttribute("aria-valuenow", "5"); // 20 characters over 86: about 129 bits

    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "4");
    expect(screen.getByRole("meter", { name: "Strength" })).toHaveAttribute("aria-valuenow", "1"); // about 26 bits
    expect(screen.getByText(/bits of entropy/)).toBeInTheDocument();
  });

  it("generates a passphrase of words, optionally capitalized and numbered", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Passphrase" }));

    expect(output("Passphrase").textContent).toMatch(/^[a-z]+(?:-[a-z]+){4}$/);

    await user.click(screen.getByRole("switch", { name: "Capitalize words" }));
    await user.click(screen.getByRole("switch", { name: "Append a two-digit number" }));
    expect(output("Passphrase").textContent).toMatch(/^[A-Z][a-z]+(?:-[A-Z][a-z]+){4}-\d{2}$/);

    await user.clear(screen.getByLabelText("Words"));
    await user.type(screen.getByLabelText("Words"), "6");
    expect(output("Passphrase").textContent).toMatch(/^[A-Z][a-z]+(?:-[A-Z][a-z]+){5}-\d{2}$/);
  });

  it("joins the words with the chosen separator", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Passphrase" }));
    await chooseOption(user, "Separator", "None");

    expect(output("Passphrase").textContent).not.toMatch(/[-._ ]/);
    await chooseOption(user, "Separator", "Underscore");
    expect(output("Passphrase").textContent).toMatch(/^[a-z]+(?:_[a-z]+){4}$/);
  });

  it("says clearly when the word count is wrong", async () => {
    const { user } = await openTool();
    await user.click(screen.getByRole("button", { name: "Passphrase" }));
    await user.clear(screen.getByLabelText("Words"));

    expect(screen.getByRole("alert")).toHaveTextContent("Word count must be a whole number from 3 to 20");
    expect(output("Passphrase").textContent).toBe("");
  });

  it("stores the options as Preferences but never the password", async () => {
    const { user, platform } = await openTool();
    await user.clear(screen.getByLabelText("Length"));
    await user.type(screen.getByLabelText("Length"), "24");
    const password = output("Password").textContent!;

    const dump = JSON.stringify(platform.dump());
    expect(dump).toContain("password-generator");
    expect(dump).toContain('"length":"24"');
    expect(dump).not.toContain(password);
  });

  it("is in Vietnamese too", async () => {
    const user = userEvent.setup();
    render(<App platform={createMemoryPlatform({ osLocale: "vi-VN" })} />);
    await user.click(await screen.findByRole("button", { name: "Password Generator" }));

    expect(await screen.findByRole("button", { name: "Mật khẩu", pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Độ dài")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cụm từ ghi nhớ" }));
    expect(screen.getByLabelText("Số từ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo lại" })).toBeInTheDocument();
  });
});
