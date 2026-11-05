import { describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE, closeAll, closeOthers, closeRight, closeTool, openTool, restoreWorkspace, showTool } from "./open-tools";

const ws = (ids: string[], active: string | null = ids.at(-1) ?? null) => ({ ids, active });

describe("Open Tools", () => {
  it("opens a Tool as a new tab at the end and makes it active", () => {
    expect(openTool(openTool(EMPTY_WORKSPACE, "json"), "base64")).toEqual(ws(["json", "base64"], "base64"));
  });

  it("switches to the tab of a Tool that is already open instead of opening it twice", () => {
    expect(openTool(ws(["json", "base64", "uuid"]), "json")).toEqual(ws(["json", "base64", "uuid"], "json"));
  });

  it("shows an open tab, and ignores a Tool that is not open", () => {
    expect(showTool(ws(["json", "base64"]), "json")).toEqual(ws(["json", "base64"], "json"));
    expect(showTool(ws(["json", "base64"]), "uuid")).toEqual(ws(["json", "base64"], "base64"));
  });

  describe("closing a tab", () => {
    it("moves to the tab on its right when the active tab closes", () => {
      expect(closeTool(ws(["json", "base64", "uuid"], "base64"), "base64")).toEqual(ws(["json", "uuid"], "uuid"));
    });

    it("moves to the tab on its left when the last tab was active", () => {
      expect(closeTool(ws(["json", "base64", "uuid"], "uuid"), "uuid")).toEqual(ws(["json", "base64"], "base64"));
    });

    it("keeps the active tab when another tab closes", () => {
      expect(closeTool(ws(["json", "base64", "uuid"], "json"), "uuid")).toEqual(ws(["json", "base64"], "json"));
    });

    it("leaves an empty workspace when the only tab closes", () => {
      expect(closeTool(ws(["json"]), "json")).toEqual(EMPTY_WORKSPACE);
    });
  });

  it("closes the other tabs and shows the one it was asked from", () => {
    expect(closeOthers(ws(["json", "base64", "uuid"], "json"), "base64")).toEqual(ws(["base64"], "base64"));
  });

  describe("closing the tabs to the right", () => {
    it("keeps the active tab when it is not among them", () => {
      expect(closeRight(ws(["json", "base64", "uuid", "jwt"], "json"), "base64")).toEqual(ws(["json", "base64"], "json"));
    });

    it("shows the tab it was asked from when the active tab closed", () => {
      expect(closeRight(ws(["json", "base64", "uuid", "jwt"], "jwt"), "base64")).toEqual(ws(["json", "base64"], "base64"));
    });
  });

  it("closes every tab", () => {
    expect(closeAll()).toEqual(EMPTY_WORKSPACE);
  });

  describe("restoring the saved tabs", () => {
    const known = ["base64", "json", "uuid"];

    it("reopens the saved tabs in order with the saved one on screen", () => {
      expect(restoreWorkspace(["uuid", "base64"], "uuid", known)).toEqual(ws(["uuid", "base64"], "uuid"));
    });

    it("drops Tools that no longer exist and duplicates", () => {
      expect(restoreWorkspace(["json", "gone", "json", "base64"], "gone", known)).toEqual(ws(["json", "base64"], "json"));
    });

    it("starts empty from anything that is not a list of ids", () => {
      expect(restoreWorkspace("json", "json", known)).toEqual(EMPTY_WORKSPACE);
      expect(restoreWorkspace([1, null, "json"], 3, known)).toEqual(ws(["json"], "json"));
    });
  });
});
