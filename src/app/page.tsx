"use client";

// Smart Digital Prescription Management System — single-page application root.
// All views render client-side under this route; data is served by the in-browser
// backend (src/lib/local-backend) so the app can be hosted as static files.

import { useCallback, useEffect, useState } from "react";
import { Loader2, PencilLine, Eye } from "lucide-react";
import { toast } from "sonner";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import type { PrescriptionDTO, SessionUser } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { usePrescriptionStore } from "@/store/prescription-store";
import { AppShell } from "@/components/shell/app-shell";
import { LoginScreen } from "@/components/auth/login-screen";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PatientsView } from "@/components/patients/patients-view";
import { PrescriptionsListView } from "@/components/prescriptions/prescriptions-list-view";
import { DoctorProfileForm } from "@/components/profile/doctor-profile-form";
import { TemplateSettingsView } from "@/components/templates/template-settings-view";
import { AdminPanel } from "@/components/admin/admin-panel";
import { EditorPanel } from "@/components/prescription/editor-panel";
import { PrescriptionPreview } from "@/components/preview/prescription-preview";
import { PrintActions } from "@/components/preview/print-actions";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useIsCompact } from "@/hooks/use-mobile";
import { useHashRouting } from "@/hooks/use-hash-routing";
import { prefetchCatalogue } from "@/lib/local-backend/medicines";

// ---------------------------------------------------------------------------
// Prescription editor workspace: split-screen (editor | live preview)
// ---------------------------------------------------------------------------

function dtoToEditorData(rx: PrescriptionDTO) {
  return {
    chiefComplaints: rx.chiefComplaints ?? [],
    history:
      rx.history ?? {
        presentIllness: "",
        pastMedical: "",
        drugHistory: "",
        familyHistory: "",
        personalHistory: "",
        allergyHistory: "",
      },
    vitals: rx.examination?.vitals ?? {},
    examinations: rx.examination?.examinations ?? [],
    diagnosis: rx.diagnosis ?? [],
    investigations: rx.investigations ?? [],
    medicines: (rx.medicines ?? []).map((m, i) => ({ ...m, _uid: `med-${rx.id}-${i}` })),
    advice: rx.advice ?? [],
    followUp: { date: rx.followUpDate ?? undefined, note: rx.followUpNote ?? "" },
  };
}

function EditorWorkspace() {
  const { lang } = useI18n();
  const editingId = useAppStore((s) => s.editingPrescriptionId);
  const presetPatientId = useAppStore((s) => s.selectedPatientId);
  const [loading, setLoading] = useState(true);
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const isMobile = useIsCompact(); // phones + tablets use the Editor | Preview tabs

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const store = usePrescriptionStore.getState();
      try {
        // Load doctor profile once per workspace session
        let profile = store.doctor;
        if (!profile) {
          const { profile: p } = await api.getDoctorProfile();
          profile = p;
          store.setDoctor(p);
        }
        if (editingId) {
          const { prescription } = await api.getPrescription(editingId);
          if (cancelled) return;
          store.loadPrescription({
            prescriptionId: prescription.id,
            status: prescription.status,
            code: prescription.code,
            version: prescription.version,
            prescriptionDate: prescription.prescriptionDate,
            patient: prescription.patient,
            doctor: prescription.doctor ?? profile,
            data: dtoToEditorData(prescription),
            template: prescription.template || profile.activeTemplate || "modern",
            templateConfig: prescription.templateConfig || "{}",
            notes: prescription.notes ?? "",
          });
        } else {
          store.resetEditor();
          store.setDoctor(profile);
          store.setTemplate(profile.activeTemplate || "modern");
          if (presetPatientId) {
            const { patient } = await api.getPatient(presetPatientId);
            if (cancelled) return;
            store.setPatient(patient);
          }
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load editor");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, presetPatientId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm">{lang === "bn" ? "লোড হচ্ছে…" : "Loading editor…"}</p>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-slate-50">
        <Tabs value={mobilePane} onValueChange={(v) => setMobilePane(v as "editor" | "preview")} className="border-b bg-white px-3 py-1.5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="editor" className="gap-1.5">
              <PencilLine className="size-4" /> {lang === "bn" ? "সম্পাদক" : "Editor"}
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5">
              <Eye className="size-4" /> {lang === "bn" ? "প্রিভিউ" : "Preview"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-h-0 flex-1 overflow-hidden">
          {mobilePane === "editor" ? (
            <div className="h-full overflow-y-auto p-2">
              <EditorPanel />
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b bg-white px-3 py-2">
                <PrintActions />
              </div>
              <PrescriptionPreview className="min-h-0 flex-1 overflow-auto bg-stone-200/60 p-3" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={52} minSize={30}>
          <div className="h-full overflow-y-auto p-3">
            <EditorPanel />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={48} minSize={26}>
          <div className="flex h-full flex-col">
            <div className="border-b bg-white px-3 py-2">
              <PrintActions />
            </div>
            <PrescriptionPreview className="min-h-0 flex-1 overflow-auto bg-stone-200/60 p-4" />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authenticated app
// ---------------------------------------------------------------------------

function AppViews() {
  const view = useAppStore((s) => s.view);
  const user = useAppStore((s) => s.user);

  switch (view) {
    case "prescription-editor":
      return <EditorWorkspace />;
    case "patients":
      return <PatientsView />;
    case "prescriptions":
      return <PrescriptionsListView />;
    case "profile":
      return (
        <div className="mx-auto max-w-5xl">
          <DoctorProfileForm />
        </div>
      );
    case "templates":
      return (
        <div className="mx-auto max-w-5xl">
          <TemplateSettingsView />
        </div>
      );
    case "admin":
      return user?.role === "SUPER_ADMIN" ? (
        <div className="mx-auto max-w-6xl">
          <AdminPanel />
        </div>
      ) : null;
    case "dashboard":
    default:
      return <DashboardView />;
  }
}

function AppBody() {
  const { t } = useI18n();
  const { user, authChecked, setUser, setAuthChecked } = useAppStore();
  useHashRouting(!!user);

  // Warm the medicine catalogue (static CSV) once the user is signed in, so the first
  // medicine search is instant.
  useEffect(() => {
    if (!user) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(prefetchCatalogue);
    else setTimeout(prefetchCatalogue, 1500);
  }, [user]);

  const bootstrap = useCallback(async () => {
    try {
      const { user: u } = await api.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, [setUser, setAuthChecked]);

  useEffect(() => {
    if (!authChecked) void bootstrap();
  }, [authChecked, bootstrap]);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSuccess={(u: SessionUser) => setUser(u)} />;
  }

  return (
    <AppShell>
      <AppViews />
    </AppShell>
  );
}

export default function Home() {
  return (
    <I18nProvider>
      <AppBody />
    </I18nProvider>
  );
}
