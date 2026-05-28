export const colors = {
  // Primary palette (dark blue terminal aesthetic)
  primary: "#5B9BD5",
  secondary: "#8EC6C5",
  accent: "#FFC857",

  // Status
  success: "#4EC9B0",
  warning: "#DCDCAA",
  error: "#F44747",
  info: "#569CD6",

  // UI
  bg: "#1B2838",
  panel: "#1E2D40",
  border: "#2A4A6B",
  borderActive: "#5B9BD5",
  text: "#C8D6E5",
  textDim: "#5C7A99",
  textBright: "#FFFFFF",

  // Syntax-like
  keyword: "#C586C0",
  string: "#CE9178",
  number: "#B5CEA8",
  function: "#DCDCAA",

  // Special
  heading: "#5B9BD5",
  label: "#7FAACC",
  value: "#C8D6E5",
  dimValue: "#5C7A99",
  green: "#4EC9B0",
  yellow: "#DCDCAA",
  red: "#F44747",
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
