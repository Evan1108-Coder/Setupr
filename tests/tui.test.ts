import { describe, expect, it } from "vitest";
import { findDirectionalFocusItem, type FocusItem } from "../src/tui/hooks/useFocusNavigation.js";
import { parseSgrMouse, stripTerminalControlInput } from "../src/tui/terminalInput.js";

const wideSetupItems: FocusItem[] = [
  { id: "steps", row: 0, column: 0, bounds: { x: 1, y: 2, width: 20, height: 6 } },
  { id: "project", row: 0, column: 1, bounds: { x: 22, y: 2, width: 20, height: 6 } },
  { id: "deps", row: 0, column: 2, bounds: { x: 43, y: 2, width: 20, height: 6 } },
  { id: "env", row: 0, column: 3, bounds: { x: 64, y: 2, width: 20, height: 6 } },
  { id: "services", row: 0, column: 4, bounds: { x: 85, y: 2, width: 20, height: 6 } },
  { id: "current", row: 0, column: 5, bounds: { x: 106, y: 2, width: 20, height: 6 } },
  { id: "diary", row: 1, column: 0, redirectTo: "input", bounds: { x: 1, y: 9, width: 82, height: 24 } },
  { id: "input", row: 2, column: 0, parentIds: ["diary"], bounds: { x: 3, y: 26, width: 78, height: 4 } },
  { id: "side", row: 1, column: 1, bounds: { x: 84, y: 9, width: 42, height: 24 } },
];

describe("TUI focus navigation", () => {
  it("moves horizontally to the visually adjacent panel", () => {
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[1], "right")?.id).toBe("deps");
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[3], "left")?.id).toBe("deps");
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[6], "right", ["diary"])?.id).toBe("side");
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[8], "left", ["side"])?.id).toBe("diary");
  });

  it("uses cross-axis visual alignment for vertical movement", () => {
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[1], "down")?.id).toBe("diary");
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[5], "down")?.id).toBe("side");
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[6], "up", ["diary"])?.id).toBe("project");
    expect(findDirectionalFocusItem(wideSetupItems, wideSetupItems[8], "up", ["side"])?.id).toBe("services");
  });
});

describe("TUI terminal control input", () => {
  it("strips SGR mouse reports even when the escape prefix is missing", () => {
    const noisy = "hello[<0;78;17m world\u001b[<64;121;35M!";
    expect(stripTerminalControlInput(noisy)).toBe("hello world!");
  });

  it("strips SGR mouse reports that arrive split across input chunks", () => {
    expect(stripTerminalControlInput("\u001b[<0;78;")).toBe("");
    expect(stripTerminalControlInput("17mhello")).toBe("hello");
    expect(stripTerminalControlInput("[<64;121;")).toBe("");
    expect(stripTerminalControlInput("35M world")).toBe(" world");
  });

  it("parses mouse press, release, and scroll reports", () => {
    expect(parseSgrMouse("\u001b[<0;10;5M")).toMatchObject({ action: "press", x: 10, y: 5 });
    expect(parseSgrMouse("\u001b[<0;10;5m")).toMatchObject({ action: "release", x: 10, y: 5 });
    expect(parseSgrMouse("\u001b[<64;10;5M")).toMatchObject({ action: "scroll", x: 10, y: 5 });
  });
});
