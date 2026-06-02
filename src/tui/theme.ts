export const colors = {
  // Terminal-native cyber palette. These are foreground/border colors only;
  // the TUI intentionally does not paint a background so terminal profiles win.
  primary: "#4AA3FF",
  secondary: "#8EC6C5",
  accent: "#FFD166",

  // Status
  success: "#6BE675",
  warning: "#FFD166",
  error: "#FF5C5C",
  info: "#569CD6",

  // UI
  bg: "#000000",
  panel: "#000000",
  border: "#24557A",
  borderActive: "#FFD166",
  text: "#D7E4F2",
  textDim: "#5D7896",
  textBright: "#FFFFFF",

  // Syntax-like
  keyword: "#C586C0",
  string: "#CE9178",
  number: "#B5CEA8",
  function: "#DCDCAA",

  // Special
  heading: "#4AA3FF",
  label: "#7FAACC",
  value: "#D7E4F2",
  dimValue: "#5D7896",
  green: "#6BE675",
  yellow: "#FFD166",
  red: "#FF5C5C",
  orange: "#E8A838",
  cyan: "#56B6C2",
};

export const icons = {
  check: "✓",
  cross: "✗",
  arrow: "→",
  arrowRight: "▸",
  dot: "●",
  circle: "○",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  warning: "△",
  info: "ℹ",
  diamond: "◆",
  triangleRight: "►",
  block: "█",
};

export const borders = {
  top: "─",
  bottom: "─",
  left: "│",
  right: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  teeLeft: "├",
  teeRight: "┤",
  teeTop: "┬",
  teeBottom: "┴",
  cross: "┼",
};

export const shortcuts = [
  { key: "Ctrl+C", desc: "abort" },
  { key: "Tab", desc: "next panel" },
  { key: "←/↑/↓/→", desc: "navigate" },
  { key: "Esc", desc: "back" },
  { key: "q", desc: "quit" },
];
