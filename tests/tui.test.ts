import { describe, expect, it } from "vitest";
import { findDirectionalFocusItem, type FocusItem } from "../src/tui/hooks/useFocusNavigation.js";
import { parseSgrMouse, stripTerminalControlInput } from "../src/tui/terminalInput.js";
import { buildChatFocusItems, buildChatLayout } from "../src/tui/layouts/ChatLayout.js";
import { buildDashboardFocusItems, buildDashboardLayout } from "../src/tui/layouts/DashboardLayout.js";
import { buildDoctorFocusItems, buildDoctorLayout } from "../src/tui/layouts/DoctorLayout.js";
import { buildEnvFocusItems, buildEnvLayout } from "../src/tui/layouts/EnvLayout.js";
import { buildStartFocusItems, buildStartLayout } from "../src/tui/layouts/StartLayout.js";
import { buildUpdateFocusItems, buildUpdateLayout } from "../src/tui/layouts/UpdateLayout.js";
import { buildCleanFocusItems, buildCleanLayout } from "../src/tui/layouts/CleanLayout.js";

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

  it("keeps chat input bottom-anchored and right panels visually reachable", () => {
    const layout = buildChatLayout(140, 36);
    const items = buildChatFocusItems(layout);
    const input = items.find((item) => item.id === "input");
    const conversation = items.find((item) => item.id === "conversation");
    const plan = items.find((item) => item.id === "plan");

    expect(layout.stacked).toBe(false);
    expect(input?.parentIds).toContain("conversation");
    expect(input?.bounds?.y).toBeGreaterThan(20);
    expect(findDirectionalFocusItem(items, conversation!, "right", ["conversation"])?.id).toBe("plan");
    expect(findDirectionalFocusItem(items, plan!, "left", ["plan"])?.id).toBe("conversation");
  });

  it("uses a stacked chat layout on narrow terminals without overflowing height", () => {
    const layout = buildChatLayout(70, 20);
    const items = buildChatFocusItems(layout);
    const maxBottom = Math.max(...items.map((item) => (item.bounds?.y || 0) + (item.bounds?.height || 0)));

    expect(layout.stacked).toBe(true);
    expect(layout.inputMaxLines).toBeGreaterThanOrEqual(1);
    expect(maxBottom).toBeLessThanOrEqual(layout.height + 2);
  });

  it("keeps env editor input bottom-anchored and navigable", () => {
    const layout = buildEnvLayout(120, 32);
    const items = buildEnvFocusItems(layout);
    const vars = items.find((item) => item.id === "vars");
    const editor = items.find((item) => item.id === "editor");
    const input = items.find((item) => item.id === "input");

    expect(layout.stacked).toBe(false);
    expect(input?.parentIds).toContain("editor");
    expect(input?.bounds?.y).toBeGreaterThan(20);
    expect(findDirectionalFocusItem(items, vars!, "right", ["vars"])?.id).toBe("details");
    expect(findDirectionalFocusItem(items, editor!, "left", ["editor", "input"])?.id).toBe("vars");
  });

  it("organizes dashboard as metric row plus actions/notices on wide terminals", () => {
    const layout = buildDashboardLayout(160, 38, "dashboard");
    const items = buildDashboardFocusItems(layout);
    const project = items.find((item) => item.id === "project");
    const actions = items.find((item) => item.id === "actions");
    const notices = items.find((item) => item.id === "notices");

    expect(layout.stacked).toBe(false);
    expect(items.slice(0, 5).map((item) => item.id)).toEqual(["project", "git", "env", "deps", "processes"]);
    expect(actions?.bounds?.y).toBeGreaterThan(project?.bounds?.y || 0);
    expect(notices?.bounds?.x).toBeGreaterThan(actions?.bounds?.x || 0);
    expect(findDirectionalFocusItem(items, project!, "right", ["project"])?.id).toBe("git");
    expect(findDirectionalFocusItem(items, notices!, "left", ["notices"])?.id).toBe("actions");
  });

  it("organizes status as health row, state/process row, and env/action row", () => {
    const layout = buildDashboardLayout(160, 38, "status");
    const items = buildDashboardFocusItems(layout);
    const health = items.find((item) => item.id === "health");
    const state = items.find((item) => item.id === "state");
    const envvars = items.find((item) => item.id === "envvars");

    expect(layout.stacked).toBe(false);
    expect(items.slice(0, 5).map((item) => item.id)).toEqual(["health", "git", "env", "tests", "security"]);
    expect(state?.bounds?.y).toBeGreaterThan(health?.bounds?.y || 0);
    expect(envvars?.bounds?.y).toBeGreaterThan(state?.bounds?.y || 0);
    expect(findDirectionalFocusItem(items, health!, "down", ["health"])?.id).toBe("state");
  });

  it("stacks dashboard/status layouts on constrained terminals without overflowing far past the screen", () => {
    for (const variant of ["dashboard", "status"] as const) {
      const layout = buildDashboardLayout(72, 22, variant);
      const items = buildDashboardFocusItems(layout);
      const maxBottom = Math.max(...items.map((item) => (item.bounds?.y || 0) + (item.bounds?.height || 0)));

      expect(layout.stacked).toBe(true);
      expect(maxBottom).toBeLessThanOrEqual(layout.height + 2);
    }
  });

  it("keeps start log input bottom-anchored with side panels on wide terminals", () => {
    const layout = buildStartLayout(150, 36);
    const items = buildStartFocusItems(layout);
    const logs = items.find((item) => item.id === "logs");
    const input = items.find((item) => item.id === "input");
    const current = items.find((item) => item.id === "current");

    expect(layout.stacked).toBe(false);
    expect(input?.parentIds).toContain("logs");
    expect(input?.bounds?.y).toBeGreaterThan(24);
    expect(findDirectionalFocusItem(items, input!, "right", ["input", "logs"])?.id).toBe("crash");
    expect(findDirectionalFocusItem(items, current!, "left", ["current"])?.id).toBe("logs");
  });

  it("keeps doctor diagnostics input bottom-anchored and AI panel reachable", () => {
    const layout = buildDoctorLayout(150, 36);
    const items = buildDoctorFocusItems(layout);
    const diagnostics = items.find((item) => item.id === "diagnostics");
    const input = items.find((item) => item.id === "input");
    const environment = items.find((item) => item.id === "environment");

    expect(layout.stacked).toBe(false);
    expect(input?.parentIds).toContain("diagnostics");
    expect(input?.bounds?.y).toBeGreaterThan(24);
    expect(findDirectionalFocusItem(items, input!, "right", ["input", "diagnostics"])?.id).toBe("ai");
    expect(findDirectionalFocusItem(items, environment!, "left", ["environment"])?.id).toBe("diagnostics");
  });

  it("stacks start/doctor layouts without overflowing constrained terminals", () => {
    const cases = [
      { layout: buildStartLayout(76, 22), items: buildStartFocusItems(buildStartLayout(76, 22)) },
      { layout: buildDoctorLayout(76, 22), items: buildDoctorFocusItems(buildDoctorLayout(76, 22)) },
    ];
    for (const { layout, items } of cases) {
      const maxBottom = Math.max(...items.map((item) => (item.bounds?.y || 0) + (item.bounds?.height || 0)));
      expect(layout.stacked).toBe(true);
      expect(maxBottom).toBeLessThanOrEqual(layout.height + 2);
    }
  });

  it("keeps update confirmation input inside the packages panel", () => {
    const layout = buildUpdateLayout(150, 36);
    const items = buildUpdateFocusItems(layout);
    const packages = items.find((item) => item.id === "packages");
    const input = items.find((item) => item.id === "input");
    const risks = items.find((item) => item.id === "risks");

    expect(layout.stacked).toBe(false);
    expect(input?.parentIds).toContain("packages");
    expect(input?.bounds?.y).toBeGreaterThan(24);
    expect(findDirectionalFocusItem(items, input!, "right", ["input", "packages"])?.id).toBe("notices");
    expect(findDirectionalFocusItem(items, risks!, "left", ["risks"])?.id).toBe("packages");
  });

  it("keeps clean confirmation input inside the safety review panel", () => {
    const layout = buildCleanLayout(150, 34);
    const items = buildCleanFocusItems(layout);
    const review = items.find((item) => item.id === "review");
    const input = items.find((item) => item.id === "input");
    const risk = items.find((item) => item.id === "risk");

    expect(layout.stacked).toBe(false);
    expect(input?.parentIds).toContain("review");
    expect(input?.bounds?.y).toBeGreaterThan(24);
    expect(findDirectionalFocusItem(items, input!, "right", ["input", "review"])?.id).toBe("risk");
    expect(findDirectionalFocusItem(items, risk!, "left", ["risk"])?.id).toBe("review");
  });

  it("stacks update/clean layouts without overflowing constrained terminals", () => {
    const cases = [
      { layout: buildUpdateLayout(76, 22), items: buildUpdateFocusItems(buildUpdateLayout(76, 22)) },
      { layout: buildCleanLayout(76, 22), items: buildCleanFocusItems(buildCleanLayout(76, 22)) },
    ];
    for (const { layout, items } of cases) {
      const maxBottom = Math.max(...items.map((item) => (item.bounds?.y || 0) + (item.bounds?.height || 0)));
      expect(layout.stacked).toBe(true);
      expect(maxBottom).toBeLessThanOrEqual(layout.height + 2);
    }
  });

  it("uses a stacked env editor layout on narrow terminals without overflowing height", () => {
    const layout = buildEnvLayout(72, 22);
    const items = buildEnvFocusItems(layout);
    const maxBottom = Math.max(...items.map((item) => (item.bounds?.y || 0) + (item.bounds?.height || 0)));

    expect(layout.stacked).toBe(true);
    expect(layout.inputMaxLines).toBeGreaterThanOrEqual(1);
    expect(maxBottom).toBeLessThanOrEqual(layout.height + 2);
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
