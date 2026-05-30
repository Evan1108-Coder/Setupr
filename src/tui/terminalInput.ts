const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

export interface SgrMouseReport {
  code: number;
  x: number;
  y: number;
  final: "M" | "m";
  action: "press" | "release" | "scroll" | "move";
}

const SGR_MOUSE_PATTERN = "\\[<\\d+;\\d+;\\d+[mM]";
const PARTIAL_SGR_MOUSE_PATTERN = "\\[<\\d*(?:;\\d*){0,2}$";
let pendingMouseContinuation = false;
let pendingControlContinuation = "";

export function stripTerminalControlInput(value: string): string {
  let input = `${pendingControlContinuation}${value}`;
  pendingControlContinuation = "";

  if (pendingMouseContinuation) {
    const continuation = input.match(/^\d*(?:;\d*){0,2}[mM]?/);
    if (continuation?.[0]) {
      input = input.slice(continuation[0].length);
    }
    pendingMouseContinuation = !/[mM]/.test(continuation?.[0] || "");
  }

  if (new RegExp(`${escapeRegExp(ESC)}?${PARTIAL_SGR_MOUSE_PATTERN}`).test(input)) {
    pendingMouseContinuation = true;
  }

  const partial = findPartialTerminalControl(input);
  if (partial) {
    pendingControlContinuation = partial.sequence;
    input = input.slice(0, partial.index);
  }

  const stripped = input
    .replace(new RegExp(`${escapeRegExp(ESC)}${SGR_MOUSE_PATTERN}`, "g"), "")
    .replace(new RegExp(SGR_MOUSE_PATTERN, "g"), "")
    .replace(new RegExp(`${escapeRegExp(ESC)}\\[200~|${escapeRegExp(ESC)}\\[201~`, "g"), "")
    .replace(new RegExp(`${escapeRegExp(ESC)}\\[[0-?]*[ -/]*[@-~]`, "g"), "")
    .replace(new RegExp(`${escapeRegExp(ESC)}\\][^${escapeRegExp(BEL)}]*(?:${escapeRegExp(BEL)}|${escapeRegExp(ESC)}\\\\)`, "g"), "")
    .replace(new RegExp(`${escapeRegExp(ESC)}\\[M.{0,3}`, "g"), "")
    .replace(new RegExp(`${escapeRegExp(ESC)}.`, "g"), "")
    .replace(new RegExp(PARTIAL_SGR_MOUSE_PATTERN), "")
    .split(ESC).join("");
  return stripC0Controls(stripped);
}

export function parseSgrMouse(input: string): SgrMouseReport | null {
  const match = new RegExp(`${escapeRegExp(ESC)}?${SGR_MOUSE_PATTERN}`).exec(input);
  if (!match) return null;

  const parts = match[0].split(ESC).join("").match(/\[<(\d+);(\d+);(\d+)([mM])/);
  if (!parts) return null;

  const code = Number(parts[1]);
  const final = parts[4] as "M" | "m";

  return {
    code,
    x: Number(parts[2]),
    y: Number(parts[3]),
    final,
    action: classifySgrMouse(code, final),
  };
}

function classifySgrMouse(code: number, final: "M" | "m"): SgrMouseReport["action"] {
  if (final === "m") return "release";
  if ((code & 64) === 64) return "scroll";
  if ((code & 32) === 32) return "move";
  return "press";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPartialTerminalControl(input: string): { index: number; sequence: string } | null {
  const escIndex = input.lastIndexOf(ESC);
  if (escIndex === -1) return null;
  const tail = input.slice(escIndex);
  if (tail === ESC) return { index: escIndex, sequence: tail };
  if (tail.startsWith(`${ESC}[`)) {
    const csiBody = tail.slice(2);
    if (/^[0-?]*[ -/]*$/.test(csiBody) || csiBody === "200" || csiBody === "201") {
      return { index: escIndex, sequence: tail };
    }
  }
  if (tail.startsWith(`${ESC}]`) && !tail.includes(BEL) && !tail.includes(`${ESC}\\`)) {
    return { index: escIndex, sequence: tail };
  }
  return null;
}

function stripC0Controls(value: string): string {
  let clean = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 31) || code === 127) continue;
    clean += char;
  }
  return clean;
}
