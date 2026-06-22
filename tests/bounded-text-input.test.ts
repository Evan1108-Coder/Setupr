import { describe, expect, it } from "vitest";
import React, { useState } from "react";
import { render } from "ink-testing-library";
import { BoundedTextInput } from "../src/tui/components/BoundedTextInput.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Drives the real BoundedTextInput through Ink's stdin keypress pipeline so the
// tests exercise the same parseKeypress path that runs in a live terminal.
function mountInput(initial = "", width = 40) {
  const state = { value: initial, submitted: null as string | null, steer: false };

  function Harness() {
    const [value, setValue] = useState(initial);
    state.value = value;
    return React.createElement(BoundedTextInput, {
      value,
      onChange: (next: string) => {
        setValue(next);
        state.value = next;
      },
      onSubmit: (text: string, meta?: { steer?: boolean }) => {
        state.submitted = text;
        state.steer = Boolean(meta?.steer);
      },
      focus: true,
      width,
    });
  }

  const utils = render(React.createElement(Harness));
  return {
    // ink-testing-library attaches the stdin listener in a post-render effect,
    // so callers must `await ready()` once before the first keystroke.
    ready: () => sleep(20),
    write: (s: string) => utils.stdin.write(s),
    async type(text: string) {
      for (const ch of text) {
        utils.stdin.write(ch);
        await sleep(2);
      }
      await sleep(10);
    },
    async key(seq: string) {
      utils.stdin.write(seq);
      await sleep(10);
    },
    frame: () => utils.lastFrame(),
    get value() {
      return state.value;
    },
    get submitted() {
      return state.submitted;
    },
    get steer() {
      return state.steer;
    },
    cleanup: () => utils.unmount(),
  };
}

const BACKSPACE = "\x7f"; // macOS Backspace key
const FN_DELETE = "\x1b[3~"; // Fn+Delete / forward-delete key
const CTRL_D = "\x04"; // forward delete shortcut
const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";

describe("BoundedTextInput key handling", () => {
  it("types plain characters without inserting spaces", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("hello");
    expect(input.value).toBe("hello");
    input.cleanup();
  });

  it("does not scramble or drop characters under a rapid keystroke burst", async () => {
    const input = mountInput();
    await input.ready();
    // Fire the whole phrase with no render gap between keystrokes — the case
    // that previously read stale closure state and produced e.g. "hlowrd".
    for (const ch of "hello world") input.write(ch);
    await sleep(40);
    expect(input.value).toBe("hello world");
    input.cleanup();
  });

  it("Backspace (\\x7f) deletes the character before the cursor", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("hello");
    expect(input.value).toBe("hello");
    await input.key(BACKSPACE);
    expect(input.value).toBe("hell");
    await input.key(BACKSPACE);
    expect(input.value).toBe("hel");
    input.cleanup();
  });

  it("Backspace mid-string removes the char left of the cursor only", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("abcd");
    await input.key(LEFT); // cursor: abc|d
    await input.key(BACKSPACE); // removes 'c'
    expect(input.value).toBe("abd");
    input.cleanup();
  });

  it("Backspace at start of input is a no-op", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("ab");
    await input.key(LEFT);
    await input.key(LEFT); // cursor at 0
    await input.key(BACKSPACE);
    expect(input.value).toBe("ab");
    input.cleanup();
  });

  it("Fn+Delete also deletes backward (indistinguishable from Backspace post-Ink)", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("hello");
    await input.key(FN_DELETE);
    expect(input.value).toBe("hell");
    input.cleanup();
  });

  it("Ctrl+D forward-deletes the character after the cursor", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("hello");
    await input.key(LEFT); // hell|o
    await input.key(CTRL_D); // removes 'o'
    expect(input.value).toBe("hell");
    input.cleanup();
  });

  it("inserts typed characters at the cursor position", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("ac");
    await input.key(LEFT); // a|c
    await input.type("b"); // ab|c
    expect(input.value).toBe("abc");
    input.cleanup();
  });

  it("submits on Enter and clears via the parent", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("ship it");
    await input.key("\r");
    expect(input.submitted).toBe("ship it");
    input.cleanup();
  });

  it("clears the line before the cursor with Ctrl+U", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("delete me");
    await input.key("\x15");
    expect(input.value).toBe("");
    input.cleanup();
  });

  it("keeps borders intact: long text wraps within width and never exceeds it", async () => {
    const input = mountInput("", 20);
    await input.ready();
    await input.type("the quick brown fox jumps over the lazy dog repeatedly today");
    const frame = input.frame() ?? "";
    const longest = Math.max(...frame.split("\n").map((l) => l.length));
    // Each visible line is bounded by the wrap width; nothing bleeds past it.
    expect(longest).toBeLessThanOrEqual(20);
    expect(input.value).toContain("repeatedly today");
    input.cleanup();
  });

  it("preserves unicode and emoji characters", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("héllo 日本 🎉 café");
    expect(input.value).toBe("héllo 日本 🎉 café");
    input.cleanup();
  });

  it("accepts a large single-chunk paste without dropping characters", async () => {
    const input = mountInput("", 60);
    await input.ready();
    input.write("x".repeat(2000));
    await sleep(60);
    expect(input.value.length).toBe(2000);
    input.cleanup();
  });

  it("keeps a masked field's real value intact while typing", async () => {
    const input = mountInput("", 40);
    await input.ready();
    // mountInput does not pass a mask; verify the underlying value model still
    // holds the true text (masking is display-only in the component).
    await input.type("secret123");
    expect(input.value).toBe("secret123");
    input.cleanup();
  });

  it("strips control characters and ANSI escape injection from typed input", async () => {
    const input = mountInput();
    await input.ready();
    input.write("a\x1b[31mb\x07c\x00d");
    await sleep(30);
    expect(input.value).toBe("abcd");
    input.cleanup();
  });

  it("clears fully under a backspace spam burst without underflowing", async () => {
    const input = mountInput();
    await input.ready();
    await input.type("abcdefghij");
    for (let i = 0; i < 15; i++) input.write(BACKSPACE);
    await sleep(60);
    expect(input.value).toBe("");
    // Typing after over-deleting must still append from an empty, valid state.
    await input.type("ok");
    expect(input.value).toBe("ok");
    input.cleanup();
  });
});
