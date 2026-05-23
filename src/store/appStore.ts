import { createStore } from "zustand/vanilla";

export type PanelId = "main" | "status" | "files" | "chat";

export type AIMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
};

export type ScanResult = {
  language: string | null;
  runtime: string | null;
  packageManager: string | null;
  framework: string | null;
  hasEnvFile: boolean;
  hasEnvExample: boolean;
  dependencies: number;
  scripts: Record<string, string>;
};

export type SetupStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  detail?: string;
};

export interface AppState {
  activePanel: PanelId;
  command: string;
  cwd: string;
  scan: ScanResult | null;
  steps: SetupStep[];
  messages: AIMessage[];
  aiThinking: boolean;
  phase: "scanning" | "planning" | "executing" | "complete" | "chat" | "idle";

  setActivePanel: (panel: PanelId) => void;
  setScan: (scan: ScanResult) => void;
  setSteps: (steps: SetupStep[]) => void;
  updateStep: (id: string, update: Partial<SetupStep>) => void;
  addMessage: (msg: AIMessage) => void;
  setAiThinking: (thinking: boolean) => void;
  setPhase: (phase: AppState["phase"]) => void;
}

export const createAppStore = (command: string, cwd: string) =>
  createStore<AppState>((set, get) => ({
    activePanel: "main",
    command,
    cwd,
    scan: null,
    steps: [],
    messages: [],
    aiThinking: false,
    phase: "idle",

    setActivePanel: (panel) => set({ activePanel: panel }),
    setScan: (scan) => set({ scan }),
    setSteps: (steps) => set({ steps }),
    updateStep: (id, update) =>
      set({
        steps: get().steps.map((s) => (s.id === id ? { ...s, ...update } : s)),
      }),
    addMessage: (msg) => set({ messages: [...get().messages, msg] }),
    setAiThinking: (thinking) => set({ aiThinking: thinking }),
    setPhase: (phase) => set({ phase }),
  }));

export type AppStore = ReturnType<typeof createAppStore>;
