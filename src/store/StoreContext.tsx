import React, { createContext, useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";
import { createAppStore, type AppState, type AppStore } from "./appStore.js";
import { bindStore } from "../agent/orchestrator.js";

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({
  command,
  cwd,
  children,
}: {
  command: string;
  cwd: string;
  children: React.ReactNode;
}) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAppStore(command, cwd);
    bindStore(storeRef.current);
  }
  return (
    <StoreContext.Provider value={storeRef.current}>
      {children}
    </StoreContext.Provider>
  );
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useAppStore must be inside StoreProvider");
  return useStore(store, selector);
}
