import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { createMemoryPlatform, type MemoryPlatform } from "@/platform/memory";

async function openSettings(platform: MemoryPlatform) {
  const user = userEvent.setup();
  render(<App platform={platform} />);
  await user.click(await screen.findByRole("button", { name: "Settings" }));
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  return { user, dialog };
}

describe("Check for updates (ADR-0001)", () => {
  it("never checks on its own, only when the user asks, and says when the app is up to date", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US", appVersion: "0.1.0", update: null });
    const { user, dialog } = await openSettings(platform);

    expect(within(dialog).getByText(/0\.1\.0/)).toBeInTheDocument();
    expect(platform.updaterState().checks).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));

    expect(await within(dialog).findByRole("status")).toHaveTextContent("Tools Hub is up to date.");
    expect(platform.updaterState().checks).toBe(1);
  });

  it("shows the new version and its changelog, and installs it only when the user chooses to", async () => {
    const platform = createMemoryPlatform({
      osLocale: "en-US",
      appVersion: "0.1.0",
      update: { version: "0.2.0", notes: "- Faster palette\n- New JSON Viewer" },
    });
    const { user, dialog } = await openSettings(platform);

    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));

    const notes = await within(dialog).findByRole("region", { name: "Version 0.2.0 is available" });
    expect(notes).toHaveTextContent("- Faster palette - New JSON Viewer");
    expect(platform.updaterState().installed).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Install and restart" }));
    expect(platform.updaterState().installed).toBe("0.2.0");
  });

  it("says why a check failed, and lets the user try again", async () => {
    const platform = createMemoryPlatform({ osLocale: "en-US", checkError: "error sending request" });
    const { user, dialog } = await openSettings(platform);

    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));

    expect(await within(dialog).findByText("Couldn’t check for updates: error sending request")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(within(dialog).getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("refuses an update whose signature does not match, and keeps the running version", async () => {
    const platform = createMemoryPlatform({
      osLocale: "en-US",
      update: { version: "0.2.0", notes: null },
      installError: "signature verification failed",
    });
    const { user, dialog } = await openSettings(platform);
    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));
    expect(await within(dialog).findByText("This release has no notes.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Install and restart" }));

    expect(await within(dialog).findByText("The update wasn’t installed: signature verification failed")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(platform.updaterState().installed).toBeNull();
  });
});
