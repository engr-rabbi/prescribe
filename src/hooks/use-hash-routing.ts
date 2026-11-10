"use client";

// Keeps the current screen in the URL hash (#/patients, #/editor/<id> …) so that
// refresh, the browser Back/Forward buttons and copied links all land on the same
// screen. A hash (instead of real paths) is what makes this work on GitHub Pages:
// the server only ever has to serve index.html.

import { useEffect, useRef, useState } from "react";
import { useAppStore, type View } from "@/store/app-store";
import { usePrescriptionStore } from "@/store/prescription-store";

const VIEW_TO_SLUG: Record<View, string> = {
  dashboard: "dashboard",
  "prescription-editor": "editor",
  patients: "patients",
  prescriptions: "prescriptions",
  profile: "profile",
  templates: "templates",
  admin: "admin",
};
const SLUG_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_TO_SLUG).map(([view, slug]) => [slug, view as View])
) as Record<string, View>;

function buildHash(view: View, editingId: string | null): string {
  const slug = VIEW_TO_SLUG[view];
  return view === "prescription-editor" && editingId
    ? `#/${slug}/${encodeURIComponent(editingId)}`
    : `#/${slug}`;
}

export function useHashRouting(enabled: boolean) {
  const view = useAppStore((s) => s.view);
  const openedId = useAppStore((s) => s.editingPrescriptionId);
  // a draft saved from the "new prescription" screen gets its id here, so a refresh reopens it
  const savedId = usePrescriptionStore((s) => s.prescriptionId);
  const editingId = openedId ?? savedId;
  const role = useAppStore((s) => s.user?.role);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const firstSync = useRef(true);

  // hash → state (on mount, and on Back/Forward / manual edits)
  useEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const [slug, rawId] = window.location.hash.replace(/^#\/?/, "").split("/");
      const next = SLUG_TO_VIEW[slug];
      const st = useAppStore.getState();
      if (!next || (next === "admin" && role !== "SUPER_ADMIN")) return;
      const id = rawId ? decodeURIComponent(rawId) : null;
      if (next === "prescription-editor") {
        if (st.view !== next || st.editingPrescriptionId !== id) st.openEditor(id, null);
      } else if (st.view !== next) {
        st.setView(next);
      }
    };
    apply();
    readyRef.current = true;
    setReady(true);
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      readyRef.current = false;
      setReady(false);
    };
  }, [enabled, role]);

  // state → hash
  useEffect(() => {
    if (!enabled || !ready) return;
    const next = buildHash(view, editingId);
    if (window.location.hash !== next) {
      // first sync replaces the entry; later navigation pushes so Back works
      if (firstSync.current) window.history.replaceState(null, "", next);
      else window.history.pushState(null, "", next);
    }
    firstSync.current = false;
  }, [enabled, ready, view, editingId]);
}
