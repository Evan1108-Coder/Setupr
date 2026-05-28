import { describe, expect, it } from "vitest";
import { findDirectionalFocusItem, type FocusItem } from "../src/tui/hooks/useFocusNavigation.js";
import { parseSgrMouse, stripTerminalControlInput } from "../src/tui/terminalInput.js";

const esc = "\x1b";

describe("terminal control input handling", () => {
  it("strips complete SGR mouse reports before text input sees them", () => {
    const noisy = `${esc}[<0;78;17Mhello[<64;121;35M world${esc}[<0;78;17m`;

    expect(stripTerminalControlInput(noisy)).toBe("hello world");
  });

  it("strips SGR mouse reports when a terminal delivers them in split chunks", () => {
    expect(stripTerminalControlInput(`${esc}[<0;78;`)).toBe("");
    expect(stripTerminalControlInput("17Mtyped")).toBe("typed");
  });

  it("parses press and wheel reports for click focus and input scrolling", () => {
    expect(parseSgrMouse(`${esc}[<0;12;5M`)).toMatchObject({
      action: "press",
      x: 12,
      y: 5,
    });
    expect(parseSgrMouse(`${esc}[<65;12;5M`)).toMatchObject({
      action: "scroll",
      code: 65,
    });
  });
});

describe("visual focus navigation", () => {
  const items: FocusItem[] = [
    { id: "steps", row: 0, column: 0, bounds: { x: 1, y: 1, width: 40, height: 8 } },
    { id: "project", row: 0, column: 1, bounds: { x: 43, y: 1, width: 40, height: 8 } },
    { id: "diary", row: 1, column: 0, bounds: { x: 1, y: 10, width: 82, height: 20 } },
    { id: "input", row: 2, column: 0, parentIds: ["diary"], bounds: { x: 3, y: 25, width: 78, height: 4 } },
    { id: "details", row: 1, column: 1, bounds: { x: 85, y: 10, width: 35, height: 20 } },
  ];

  it("moves to the visually nearest panel in each direction", () => {
    expect(findDirectionalFocusItem(items, items[0], "right")?.id).toBe("project");
    expect(findDirectionalFocusItem(items, items[0], "down")?.id).toBe("diary");
    expect(findDirectionalFocusItem(items, items[2], "right")?.id).toBe("details");
    expect(findDirectionalFocusItem(items, items[4], "left")?.id).toBe("diary");
    expect(findDirectionalFocusItem(items, items[2], "up")?.id).toBe("steps");
  });
}
);
