import { useInput } from "ink";
import { useAppStore } from "../store/StoreContext.js";
import type { PanelId } from "../store/appStore.js";

const PANEL_GRID: PanelId[][] = [
  ["main", "status"],
  ["main", "files"],
  ["chat", "chat"],
];

export function useKeyboardNav() {
  const activePanel = useAppStore((s) => s.activePanel);
  const setActivePanel = useAppStore((s) => s.setActivePanel);

  useInput((input, key) => {
    if (!key.tab && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow) {
      return;
    }

    if (key.tab) {
      const order: PanelId[] = ["main", "status", "files", "chat"];
      const idx = order.indexOf(activePanel);
      const next = order[(idx + 1) % order.length];
      setActivePanel(next);
      return;
    }

    let row = -1;
    let col = -1;
    for (let r = 0; r < PANEL_GRID.length; r++) {
      const c = PANEL_GRID[r].indexOf(activePanel);
      if (c !== -1) {
        row = r;
        col = c;
        break;
      }
    }
    if (row === -1) return;

    if (key.upArrow && row > 0) {
      setActivePanel(PANEL_GRID[row - 1][col]);
    } else if (key.downArrow && row < PANEL_GRID.length - 1) {
      setActivePanel(PANEL_GRID[row + 1][col]);
    } else if (key.leftArrow && col > 0) {
      setActivePanel(PANEL_GRID[row][col - 1]);
    } else if (key.rightArrow && col < PANEL_GRID[row].length - 1) {
      setActivePanel(PANEL_GRID[row][col + 1]);
    }
  });
}
