import { createStore } from "zustand/vanilla";
import type { ScanResult } from "../scanner/index.js";
import type { SetupStep } from "../ai/planner.js";
import type { ProjectContext } from "../ai/dsl.js";

export interface AppMessage {
  id: string;
  role: "system" | "user" | "assistant" | "thinking";
  content: string;
  timestamp: number;
  level?: "pattern" | "cached" | "live";
  cost?: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  content: string;
  type: "info" | "success" | "warning" | "error" | "command" | "progress";
  stepIndex?: number;
}

export interface EnvVar {
  key: string;
  value: string;
  status: "filled" | "auto" | "pending" | "skipped";
  source?: string;
}

export interface PortInfo {
  service: string;
  port: number;
  status: "free" | "in_use";
  remapped?: number;
}

export interface DepInfo {
  name: string;
  version: string;
  status: "ok" | "outdated" | "missing";
}

export interface ServiceInfo {
  name: string;
  status: "ready" | "starting" | "pending" | "running" | "error";
  port?: number;
}

export interface NoticeInfo {
  type: "warning" | "error" | "info";
  message: string;
}

export interface AppState {
  // Navigation
  activePanel: number;
  panelCount: number;

  // Project
  cwd: string;
  projectName: string;
  scan: ScanResult | null;
  context: ProjectContext | null;

  // Setup flow
  steps: SetupStep[];
  currentStepIndex: number;
  isRunning: boolean;
  isComplete: boolean;
  startTime: number;
  elapsed: number;

  // Chat
  messages: AppMessage[];
  inputValue: string;

  // Log stream (timestamped execution log)
  logs: LogEntry[];

  // Environment
  envVars: EnvVar[];
  envSource: string;
  envPromptKey: string | null;
  envPromptValue: string;

  // Ports
  ports: PortInfo[];

  // Key dependencies
  keyDeps: DepInfo[];

  // Services
  services: ServiceInfo[];

  // Notices
  notices: NoticeInfo[];

  // Checkpoint
  checkpointSaved: boolean;
  checkpointPath: string;

  // Package stats
  totalPackages: number;
  installedPackages: number;
  deprecatedCount: number;
  vulnerabilities: { high: number; moderate: number; low: number };
  lockSynced: boolean;

  // Actions
  setScan: (scan: ScanResult) => void;
  setContext: (ctx: ProjectContext) => void;
  setSteps: (steps: SetupStep[]) => void;
  updateStep: (id: string, update: Partial<SetupStep>) => void;
  nextStep: () => void;
  addMessage: (msg: Omit<AppMessage, "id" | "timestamp">) => void;
  addLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  setInput: (value: string) => void;
  setActivePanel: (index: number) => void;
  setRunning: (running: boolean) => void;
  setComplete: (complete: boolean) => void;
  setElapsed: (elapsed: number) => void;
  setEnvVars: (vars: EnvVar[]) => void;
  setEnvPrompt: (key: string | null) => void;
  setEnvPromptValue: (value: string) => void;
  setPorts: (ports: PortInfo[]) => void;
  setKeyDeps: (deps: DepInfo[]) => void;
  setServices: (services: ServiceInfo[]) => void;
  addNotice: (notice: NoticeInfo) => void;
  setCheckpoint: (saved: boolean) => void;
  setPackageStats: (stats: { total: number; installed: number; deprecated: number }) => void;
}

export function createAppStore(cwd: string) {
  const projectName = cwd.split("/").pop() || "project";

  return createStore<AppState>((set, get) => ({
    activePanel: 0,
    panelCount: 4,
    cwd,
    projectName,
    scan: null,
    context: null,
    steps: [],
    currentStepIndex: 0,
    isRunning: false,
    isComplete: false,
    startTime: Date.now(),
    elapsed: 0,
    messages: [],
    inputValue: "",
    logs: [],
    envVars: [],
    envSource: "",
    envPromptKey: null,
    envPromptValue: "",
    ports: [],
    keyDeps: [],
    services: [],
    notices: [],
    checkpointSaved: false,
    checkpointPath: ".p-setup/state.json",
    totalPackages: 0,
    installedPackages: 0,
    deprecatedCount: 0,
    vulnerabilities: { high: 0, moderate: 0, low: 0 },
    lockSynced: false,

    setScan: (scan) => set({ scan }),
    setContext: (context) => set({ context }),
    setSteps: (steps) => set({ steps }),

    updateStep: (id, update) =>
      set((state) => ({
        steps: state.steps.map((s) => (s.id === id ? { ...s, ...update } : s)),
      })),

    nextStep: () =>
      set((state) => ({
        currentStepIndex: Math.min(state.currentStepIndex + 1, state.steps.length - 1),
      })),

    addMessage: (msg) =>
      set((state) => {
        const messages = [
          ...state.messages,
          { ...msg, id: crypto.randomUUID().slice(0, 8), timestamp: Date.now() },
        ];
        return { messages: messages.length > 500 ? messages.slice(-500) : messages };
      }),

    addLog: (entry) =>
      set((state) => {
        const logs = [
          ...state.logs,
          { ...entry, id: crypto.randomUUID().slice(0, 8), timestamp: Date.now() },
        ];
        return { logs: logs.length > 500 ? logs.slice(-500) : logs };
      }),

    setInput: (inputValue) => set({ inputValue }),
    setActivePanel: (activePanel) => set({ activePanel }),
    setRunning: (isRunning) => set({ isRunning }),
    setComplete: (isComplete) => set({ isComplete }),
    setElapsed: (elapsed) => set({ elapsed }),
    setEnvVars: (envVars) => set({ envVars }),
    setEnvPrompt: (envPromptKey) => set({ envPromptKey }),
    setEnvPromptValue: (envPromptValue) => set({ envPromptValue }),
    setPorts: (ports) => set({ ports }),
    setKeyDeps: (deps) => set({ keyDeps: deps }),
    setServices: (services) => set({ services }),
    addNotice: (notice) => set((state) => ({ notices: [...state.notices, notice] })),
    setCheckpoint: (checkpointSaved) => set({ checkpointSaved }),
    setPackageStats: (stats) =>
      set({ totalPackages: stats.total, installedPackages: stats.installed, deprecatedCount: stats.deprecated }),
  }));
}

export type AppStore = ReturnType<typeof createAppStore>;
