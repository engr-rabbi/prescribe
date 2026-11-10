"use client";

import { create } from "zustand";
import type { SessionUser } from "@/lib/types";

export type View =
  | "dashboard"
  | "prescription-editor"
  | "patients"
  | "prescriptions"
  | "profile"
  | "templates"
  | "admin";

const SIDEBAR_KEY = "rx_sidebar_collapsed";

function readSidebarPref(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarPref(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {
    /* storage unavailable — preference just isn't remembered */
  }
}

interface AppState {
  user: SessionUser | null;
  authChecked: boolean;
  view: View;
  editingPrescriptionId: string | null; // null = new prescription
  selectedPatientId: string | null; // preset patient when opening editor
  /** Desktop navigation rail: collapsed to icons so the workspace gets more room. */
  sidebarCollapsed: boolean;
  setView: (v: View) => void;
  setUser: (u: SessionUser | null) => void;
  setAuthChecked: (b: boolean) => void;
  openEditor: (prescriptionId?: string | null, patientId?: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  authChecked: false,
  view: "dashboard",
  editingPrescriptionId: null,
  selectedPatientId: null,
  // The page only renders the shell after the client-side auth check, so reading
  // the saved preference here can't cause a hydration mismatch.
  sidebarCollapsed: typeof window !== "undefined" ? readSidebarPref() : false,
  setView: (view) => set({ view }),
  setUser: (user) => set({ user }),
  setAuthChecked: (authChecked) => set({ authChecked }),
  openEditor: (prescriptionId = null, patientId = null) =>
    set({ view: "prescription-editor", editingPrescriptionId: prescriptionId, selectedPatientId: patientId }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    writeSidebarPref(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
}));
