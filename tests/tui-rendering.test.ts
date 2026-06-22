import { describe, expect, it } from "vitest";
import React, { useState } from "react";
import { render } from "ink-testing-library";
import stripAnsi from "strip-ansi";
import { ChatInput } from "../src/tui/components/ChatInput.js";
import { Panel } from "../src/tui/components/Panel.js";
import { Text } from "ink";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Visible width of a rendered line (ANSI stripped). Box-drawing glyphs count as
// one column, matching how a terminal lays them out.
function lineWidths(frame: string | undefined): number[] {
  return stripAnsi(frame ?? "")
    .split("\n")
    .map((line) => [...line].length);
}

describe("TUI rendering integrity", () => {
  it("keeps the chat input border a stable rectangle while typing a long line", async () => {
    const width = 60;
    const utils = render(React.createElement(ChatInput, { active: true, onSubmit: () => {}, width }));
    await sleep(20);

    const long = "the quick brown fox jumps over the lazy dog ".repeat(5).trim();
    for (const ch of long) utils.stdin.write(ch);
    await sleep(60);

    const widths = lineWidths(utils.lastFrame()).filter((w) => w > 0);
    // Every rendered row must be exactly the box width — no row longer (overflow
    // that "squishes"/wraps the border) and the border rows must not be ragged.
    const max = Math.max(...widths);
    expect(max).toBeLessThanOrEqual(width);
    // The top and bottom border rows span the full width; confirm at least two
    // rows hit the full width so the box stayed a clean rectangle.
    expect(widths.filter((w) => w === width).length).toBeGreaterThanOrEqual(2);
    utils.unmount();
  });

  it("renders a stable bordered Panel rectangle at multiple widths", () => {
    for (const width of [40, 60, 100]) {
      const utils = render(
        React.createElement(
          Panel,
          { title: "diagnostics", width, height: 6 },
          React.createElement(Text, null, "All systems nominal — checking dependencies and environment.")
        )
      );
      const widths = lineWidths(utils.lastFrame()).filter((w) => w > 0);
      expect(Math.max(...widths)).toBeLessThanOrEqual(width);
      // Top + bottom borders both span the full width.
      expect(widths.filter((w) => w === width).length).toBeGreaterThanOrEqual(2);
      utils.unmount();
    }
  });

  it("does not let a very long unbroken token overflow the input width", async () => {
    const width = 50;
    const utils = render(React.createElement(ChatInput, { active: true, onSubmit: () => {}, width }));
    await sleep(20);
    const blob = "x".repeat(400);
    utils.stdin.write(blob);
    await sleep(60);
    const widths = lineWidths(utils.lastFrame()).filter((w) => w > 0);
    expect(Math.max(...widths)).toBeLessThanOrEqual(width);
    utils.unmount();
  });
});
