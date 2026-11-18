"use client";

// The prescription EDITOR (left panel): one scrollable column of compact
// collapsible sections — patient, chief complaints, history, examination
// (vitals + clinical findings), diagnosis, investigations, medicines,
// advice, follow-up — with a sticky action bar (save draft / finalize & sign /
// status badge). Every clinical field is click-to-select with free typing.

import * as React from "react";
import {
  CalendarClockIcon,
  ChevronDownIcon,
  FileCheckIcon,
  FlaskConicalIcon,
  HeartPulseIcon,
  HistoryIcon,
  LightbulbIcon,
  Loader2Icon,
  LockIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
  PillIcon,
  PlusIcon,
  SaveIcon,
  StethoscopeIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type {
  ChamberDTO,
  HistorySection,
  LibraryItemDTO,
  MedicineRecord,
  PrescriptionDTO,
  Vitals,
} from "@/lib/types";
import { useI18n, type DictKey } from "@/lib/i18n";
import { calcBMI } from "@/lib/rx-utils";
import { DURATIONS_FOR_COMPLAINTS } from "@/lib/seed-library-data";
import { SEVERITY_OPTIONS } from "@/lib/medical-db-expansion";
import { usePrescriptionStore } from "@/store/prescription-store";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  SearchCombobox,
  type ComboboxOption,
} from "@/components/combobox/search-combobox";
import { LibraryCombobox } from "@/components/combobox/library-combobox";
import { LibraryPicker } from "@/components/combobox/library-picker-dialog";
import { PatientPicker } from "./patient-picker";
import { MedicineSearchDialog } from "./medicine-search-dialog";
import { MedicineLineEditor } from "./medicine-line-editor";

// ---------------------------------------------------------------------------
// local strings missing from the shared i18n dict (dict must not be edited)
// ---------------------------------------------------------------------------

const L = {
  pdfSaved: { en: "PDF saved with the prescription", bn: "প্রেসক্রিপশনের PDF সংরক্ষিত হয়েছে" },
  pdfFailed: { en: "Finalized, but the PDF could not be saved", bn: "ফাইনালাইজ হয়েছে, কিন্তু PDF সংরক্ষণ করা যায়নি" },
  details: { en: "Details (optional)", bn: "বিস্তারিত (ঐচ্ছিক)" },
  insert: { en: "insert", bn: "যোগ" },
  addFinding: { en: "Add finding…", bn: "ফাইন্ডিং যোগ করুন…" },
  findingValue: { en: "e.g. (-) / present", bn: "যেমন (-) / আছে" },
  note: { en: "note", bn: "নোট" },
  withReports: { en: "With reports", bn: "রিপোর্ট সহ" },
  ifNotRelieved: { en: "If not relieved", bn: "না ভালো হলে" },
  internalOnly: { en: "not printed", bn: "প্রিন্ট হবে না" },
  patientRequired: { en: "Select a patient first", bn: "প্রথমে রোগী নির্বাচন করুন" },
  finalizedBanner: { en: "Finalized — create a revision to edit", bn: "চূড়ান্ত করা হয়েছে — সম্পাদনা করতে সংশোধনী তৈরি করুন" },
  confirmFinalize: {
    en: "Finalize this prescription? It will be signed and locked for editing.",
    bn: "প্রেসক্রিপশন চূড়ান্ত করবেন? এটি স্বাক্ষরিত হবে এবং আর সম্পাদনা করা যাবে না।",
  },
  revisionPh: { en: "What changed? (optional)", bn: "কী পরিবর্তন হয়েছে? (ঐচ্ছিক)" },
  unsaved: { en: "Unsaved changes", bn: "অসংরক্ষিত পরিবর্তন" },
};

// ---------------------------------------------------------------------------

// All 14 history categories (order follows standard clinical documentation)
const HISTORY_FIELDS: { key: keyof HistorySection; labelKey: DictKey }[] = [
  { key: "presentIllness", labelKey: "presentIllness" },
  { key: "pastMedical", labelKey: "pastMedical" },
  { key: "pastSurgical", labelKey: "pastSurgical" },
  { key: "drugHistory", labelKey: "drugHistory" },
  { key: "familyHistory", labelKey: "familyHistory" },
  { key: "personalHistory", labelKey: "personalHistory" },
  { key: "socialHistory", labelKey: "socialHistory" },
  { key: "allergyHistory", labelKey: "allergyHistory" },
  { key: "occupationalHistory", labelKey: "occupationalHistory" },
  { key: "menstrualHistory", labelKey: "menstrualHistory" },
  { key: "obstetricHistory", labelKey: "obstetricHistory" },
  { key: "immunizationHistory", labelKey: "immunizationHistory" },
  { key: "dietaryHistory", labelKey: "dietaryHistory" },
  { key: "previousInvestigations", labelKey: "previousInvestigations" },
];

const TEMP_PRESETS = ["98.4", "99", "100", "101"];

const FOLLOW_UP_CHIPS: [string, string][] = [
  [L.withReports.en, L.withReports.bn],
  [L.ifNotRelieved.en, L.ifNotRelieved.bn],
];

// Typed save payload (mirrors the prescription API contract)
interface RxSavePayload {
  patientId: string;
  template: string;
  templateConfig: string;
  notes: string;
  chamberId?: string | null;
  chiefComplaints: { label: string; labelBn?: string; duration: string; severity?: string; details?: string }[];
  history: HistorySection;
  examination: { vitals: Vitals; examinations: { label: string; labelBn?: string; value: string }[] };
  diagnosis: { label: string; labelBn?: string; icd10?: string; type: "primary" | "secondary" }[];
  investigations: { label: string; note?: string }[];
  advice: { label: string; labelBn?: string }[];
  followUpDate: string | null;
  followUpNote: string;
  medicines: {
    medicineId: number | null;
    brandName: string;
    generic: string;
    strength: string;
    dosageForm: string;
    manufacturer: string;
    dose: string;
    route: string;
    frequency: string;
    mealTiming: string;
    duration: string;
    specialInstruction: string;
    customText: string;
  }[];
}

// ---------------------------------------------------------------------------
// small building blocks
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  return (
    <section className="rounded-lg border bg-card shadow-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none"
      >
        <span className="text-teal-600 dark:text-teal-400">{icon}</span>
        <span className="text-sm font-semibold">{title}</span>
        {typeof count === "number" && count > 0 ? (
          <Badge variant="secondary" className="px-1.5 text-[10px]">
            {count}
          </Badge>
        ) : null}
        <ChevronDownIcon
          className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="space-y-2 border-t px-3 py-2.5">{children}</div> : null}
    </section>
  );
}

function VitalField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">
        {label}
        {unit ? <span className="opacity-60"> ({unit})</span> : null}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        disabled={disabled}
        className="h-8 text-sm"
      />
    </div>
  );
}

function ChipButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-teal-600/30 px-1.5 py-0.5 text-[10px] text-teal-700 transition-colors hover:bg-teal-50 disabled:opacity-50 dark:border-teal-500/40 dark:text-teal-400 dark:hover:bg-teal-950/40"
    >
      {label}
    </button>
  );
}

function RowRemove({ onClick, disabled, title }: { onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <XIcon className="size-3.5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// EditorPanel
// ---------------------------------------------------------------------------

export interface EditorPanelProps {
  className?: string;
}

export function EditorPanel({ className }: EditorPanelProps) {
  const { lang, t } = useI18n();
  const rx = usePrescriptionStore();
  const role = useAppStore((s) => s.user?.role);

  const d = rx.data;
  const v = d.vitals;
  const locked = rx.status === "FINALIZED";
  const canFinalize = role !== "ASSISTANT";

  const [medDialogOpen, setMedDialogOpen] = React.useState(false);
  const [expandedMeds, setExpandedMeds] = React.useState<Set<string>>(new Set());
  const [finalDialogOpen, setFinalDialogOpen] = React.useState(false);
  const [revDialogOpen, setRevDialogOpen] = React.useState(false);
  const [revisionNote, setRevisionNote] = React.useState("");
  const [chambers, setChambers] = React.useState<ChamberDTO[]>([]);

  // chambers for the "Chamber for this prescription" select
  React.useEffect(() => {
    let cancelled = false;
    api
      .listChambers()
      .then((res) => {
        if (!cancelled) setChambers(res.chambers ?? []);
      })
      .catch(() => {
        /* chambers are optional — silently ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bmi = calcBMI(v.weight, v.height);

  // ---- option loaders -----------------------------------------------------

  const loadComplaintDurations = React.useCallback(async (q: string): Promise<ComboboxOption[]> => {
    const n = q.toLowerCase();
    return DURATIONS_FOR_COMPLAINTS.filter((x) => x.toLowerCase().includes(n)).map((x) => ({
      value: x,
      label: x,
    }));
  }, []);

  const loadSeverityOptions = React.useCallback(
    async (q: string): Promise<ComboboxOption[]> => {
      const n = q.toLowerCase();
      return SEVERITY_OPTIONS.filter(([en, bn]) => en.toLowerCase().includes(n) || bn.includes(q)).map(
        ([en, bn]) => ({
          value: en,
          label: lang === "bn" ? `${bn} (${en})` : en,
          labelBn: bn,
        })
      );
    },
    [lang]
  );

  // ---- history helpers ----------------------------------------------------

  const setHistoryKey = (key: keyof HistorySection, value: string) =>
    rx.setHistory({ [key]: value } as Partial<HistorySection>);

  const insertHistory = (key: keyof HistorySection, items: LibraryItemDTO[]) => {
    const texts = items.map((item) =>
      lang === "bn" && item.labelBn ? item.labelBn : item.labelEn
    );
    if (texts.length === 0) return;
    const cur = d.history[key];
    setHistoryKey(key, cur ? `${cur}, ${texts.join(", ")}` : texts.join(", "));
  };

  // ---- medicines ----------------------------------------------------------

  const toggleMed = (uid: string) =>
    setExpandedMeds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const handleMedicinePicked = (m: MedicineRecord) => {
    const uid = rx.addMedicine({
      medicineId: m.id,
      brandName: m.brandName,
      generic: m.generic,
      strength: m.strength,
      dosageForm: m.dosageForm,
      manufacturer: m.manufacturer,
    });
    setExpandedMeds(new Set([uid])); // expand the new one, collapse the rest
  };

  // ---- save / finalize / revise ------------------------------------------

  const applyPrescription = (p: PrescriptionDTO) => {
    rx.loadPrescription({
      prescriptionId: p.id,
      status: p.status,
      code: p.code,
      version: p.version,
      prescriptionDate: p.prescriptionDate,
      patient: p.patient,
      doctor: p.doctor,
      chamberId: p.chamberId ?? null,
      data: {
        chiefComplaints: p.chiefComplaints,
        history: p.history,
        vitals: p.examination?.vitals ?? {},
        examinations: p.examination?.examinations ?? [],
        diagnosis: p.diagnosis,
        investigations: p.investigations,
        medicines: p.medicines.map((m, i) => ({ ...m, _uid: `med-${i}` })),
        advice: p.advice,
        followUp: { date: p.followUpDate ?? undefined, note: p.followUpNote },
      },
      template: p.template,
      templateConfig: p.templateConfig,
      notes: p.notes,
    });
  };

  const buildPayload = (): RxSavePayload => ({
    patientId: rx.patient?.id ?? "",
    template: rx.template,
    templateConfig: rx.templateConfig,
    notes: rx.notes,
    chamberId: rx.chamberId ?? undefined,
    chiefComplaints: d.chiefComplaints.map((c) => ({
      label: c.label,
      labelBn: c.labelBn,
      duration: c.duration,
      severity: c.severity,
      details: c.details,
    })),
    history: d.history,
    examination: {
      vitals: v,
      examinations: d.examinations.map((e) => ({ label: e.label, labelBn: e.labelBn, value: e.value })),
    },
    diagnosis: d.diagnosis.map((x) => ({
      label: x.label,
      labelBn: x.labelBn,
      icd10: x.icd10,
      type: x.type,
    })),
    investigations: d.investigations.map((x) => ({ label: x.label, note: x.note })),
    advice: d.advice.map((a) => ({ label: a.label, labelBn: a.labelBn })),
    followUpDate: d.followUp.date || null,
    followUpNote: d.followUp.note ?? "",
    medicines: d.medicines.map((m) => ({
      medicineId: m.medicineId ?? null,
      brandName: m.brandName,
      generic: m.generic,
      strength: m.strength,
      dosageForm: m.dosageForm,
      manufacturer: m.manufacturer,
      dose: m.dose,
      route: m.route,
      frequency: m.frequency,
      mealTiming: m.mealTiming,
      duration: m.duration,
      specialInstruction: m.specialInstruction,
      customText: m.customText,
    })),
  });

  const doSave = async (): Promise<PrescriptionDTO | null> => {
    if (!rx.patient) {
      toast.error(L.patientRequired[lang]);
      return null;
    }
    rx.setSaving(true);
    try {
      const payload = buildPayload();
      const res = rx.prescriptionId
        ? await api.updatePrescription(rx.prescriptionId, payload)
        : await api.createPrescription(payload);
      applyPrescription(res.prescription);
      rx.setDirty(false);
      toast.success(t("saved"));
      return res.prescription;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
      return null;
    } finally {
      rx.setSaving(false);
    }
  };

  const doFinalize = async () => {
    const saved = await doSave();
    if (!saved) return;
    try {
      const res = await api.finalizePrescription(saved.id);
      applyPrescription(res.prescription);
      toast.success(t("finalized"));
      // keep a PDF copy with the record (Google Drive in the Google build) — never blocks finalizing
      const fin = res.prescription;
      void (async () => {
        try {
          const { savePrescriptionPdf } = await import("@/lib/pdf-export");
          await savePrescriptionPdf(fin.id, fin.code, fin.version);
          toast.success(L.pdfSaved[lang]);
        } catch (err) {
          toast.warning(`${L.pdfFailed[lang]}${err instanceof Error ? ` (${err.message})` : ""}`);
        }
      })();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    }
  };

  const doRevise = async () => {
    if (!rx.prescriptionId) return;
    const id = rx.prescriptionId;
    setRevDialogOpen(false);
    try {
      const res = await api.revisePrescription(id, revisionNote);
      applyPrescription(res.prescription);
      setRevisionNote("");
      setExpandedMeds(new Set());
      toast.success(t("revision"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    }
  };

  // ---- render -------------------------------------------------------------

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background", className)}>
      {/* slim header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">{t("rxEditor")}</span>
        {rx.dirty && !locked ? (
          <span className="size-1.5 rounded-full bg-amber-500" title={L.unsaved[lang]} />
        ) : null}
        {rx.code ? (
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {rx.code} · v{rx.version}
          </span>
        ) : null}
      </div>

      {/* scrollable sections */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {locked ? (
          <Alert className="border-amber-500/50 bg-amber-50/70 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 [&>svg]:text-amber-600">
            <LockIcon />
            <AlertTitle className="text-sm">{L.finalizedBanner[lang]}</AlertTitle>
            <AlertDescription className="text-xs">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1.5 h-7 border-teal-600/50 text-teal-700 hover:bg-teal-50 dark:border-teal-500/50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                onClick={() => setRevDialogOpen(true)}
              >
                <PencilLineIcon className="size-3.5" />
                {t("createRevision")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* 1. Patient ------------------------------------------------------- */}
        <Section icon={<UserRoundIcon className="size-4" />} title={t("patient")}>
          <PatientPicker disabled={locked} />
          {chambers.length > 0 ? (
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{t("selectChamber")}</div>
              <Select
                value={rx.chamberId ?? "__default__"}
                onValueChange={(val) => rx.setChamberId(val === "__default__" ? null : val)}
                disabled={locked}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">{t("chamberDefault")}</SelectItem>
                  {chambers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.isPrimary ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </Section>

        {/* 2. Chief Complaints ---------------------------------------------- */}
        <Section
          icon={<MessageSquareTextIcon className="size-4" />}
          title={t("chiefComplaints")}
          count={d.chiefComplaints.length}
        >
          {d.chiefComplaints.map((c) => {
            const isBn = lang === "bn" && !!c.labelBn;
            return (
              <div key={c.id} className="space-y-1.5 rounded-md border bg-background/60 px-2 py-1.5">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{isBn ? c.labelBn : c.label}</div>
                    {c.labelBn ? (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {isBn ? c.label : c.labelBn}
                      </div>
                    ) : null}
                  </div>
                  <RowRemove onClick={() => rx.removeComplaint(c.id)} disabled={locked} title={t("delete")} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="w-32 shrink-0">
                    <SearchCombobox
                      size="sm"
                      value={c.duration}
                      placeholder={t("duration")}
                      loadOptions={loadComplaintDurations}
                      allowCustom
                      onSelect={(o) => rx.updateComplaint(c.id, { duration: o.label })}
                      disabled={locked}
                      debounceMs={80}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <SearchCombobox
                      size="sm"
                      value={c.severity ?? ""}
                      placeholder={t("severity")}
                      loadOptions={loadSeverityOptions}
                      allowCustom
                      onSelect={(o) => rx.updateComplaint(c.id, { severity: o.label })}
                      disabled={locked}
                      debounceMs={80}
                    />
                  </div>
                  <Input
                    value={c.details ?? ""}
                    onChange={(e) => rx.updateComplaint(c.id, { details: e.target.value })}
                    placeholder={t("details")}
                    className="h-8 min-w-24 flex-1 text-sm"
                    disabled={locked}
                  />
                </div>
              </div>
            );
          })}
          <LibraryPicker
            category="COMPLAINT"
            title={t("chiefComplaints")}
            triggerLabel={t("addComplaint")}
            onAdd={(items) =>
              items.forEach((item) => rx.addComplaint(item.labelEn, item.labelBn || undefined))
            }
            disabled={locked}
          />
        </Section>

        {/* 3. History --------------------------------------------------------- */}
        <Section icon={<HistoryIcon className="size-4" />} title={t("history")}>
          <div className="grid gap-x-3 gap-y-2.5 md:grid-cols-2">
            {HISTORY_FIELDS.map(({ key, labelKey }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
                    {t(labelKey)}
                  </span>
                  <LibraryPicker
                    category="HISTORY"
                    fixedSubcategory={key}
                    variant="button"
                    size="sm"
                    buttonLabel={L.insert[lang]}
                    title={t(labelKey)}
                    onAdd={(items) => insertHistory(key, items)}
                    disabled={locked}
                  />
                </div>
                <Textarea
                  rows={2}
                  value={d.history[key]}
                  onChange={(e) => setHistoryKey(key, e.target.value)}
                  disabled={locked}
                  className="min-h-0 text-sm"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* 4. On Examination --------------------------------------------------- */}
        <Section icon={<HeartPulseIcon className="size-4" />} title={t("onExamination")}>
          {/* vitals */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("vitals")}
              </span>
              {bmi ? (
                <Badge
                  variant="outline"
                  className="border-teal-600/40 px-1.5 text-[10px] font-normal text-teal-700 dark:text-teal-400"
                >
                  {t("bmi")} {bmi}
                </Badge>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {t("bp")} <span className="opacity-60">(mmHg)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    value={v.bpSystolic ?? ""}
                    onChange={(e) => rx.setVitals({ bpSystolic: e.target.value })}
                    placeholder="120"
                    inputMode="numeric"
                    disabled={locked}
                    className="h-8 min-w-0 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">/</span>
                  <Input
                    value={v.bpDiastolic ?? ""}
                    onChange={(e) => rx.setVitals({ bpDiastolic: e.target.value })}
                    placeholder="80"
                    inputMode="numeric"
                    disabled={locked}
                    className="h-8 min-w-0 text-sm"
                  />
                </div>
              </div>
              <VitalField
                label={t("pulse")}
                unit="/min"
                placeholder="72"
                value={v.pulse ?? ""}
                onChange={(val) => rx.setVitals({ pulse: val })}
                disabled={locked}
              />
              <div className="space-y-1">
                <VitalField
                  label={t("temp")}
                  unit="°F"
                  placeholder="98.4"
                  value={v.temperature ?? ""}
                  onChange={(val) => rx.setVitals({ temperature: val })}
                  disabled={locked}
                />
                <div className="flex flex-wrap gap-1">
                  {TEMP_PRESETS.map((chip) => (
                    <ChipButton
                      key={chip}
                      label={chip}
                      disabled={locked}
                      onClick={() => rx.setVitals({ temperature: chip })}
                    />
                  ))}
                </div>
              </div>
              <VitalField
                label={t("rr")}
                unit="/min"
                placeholder="16"
                value={v.respiratoryRate ?? ""}
                onChange={(val) => rx.setVitals({ respiratoryRate: val })}
                disabled={locked}
              />
              <VitalField
                label={t("spo2")}
                unit="%"
                placeholder="98"
                value={v.spo2 ?? ""}
                onChange={(val) => rx.setVitals({ spo2: val })}
                disabled={locked}
              />
              <VitalField
                label={t("weight")}
                unit="kg"
                placeholder="60"
                value={v.weight ?? ""}
                onChange={(val) => rx.setVitals({ weight: val })}
                disabled={locked}
              />
              <VitalField
                label={t("height")}
                unit="cm"
                placeholder="165"
                value={v.height ?? ""}
                onChange={(val) => rx.setVitals({ height: val })}
                disabled={locked}
              />
            </div>
          </div>

          {/* clinical findings */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t("clinicalFindings")}
            </span>
            {d.examinations.map((ex) => (
              <div key={ex.id} className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {lang === "bn" && ex.labelBn ? ex.labelBn : ex.label}
                </span>
                <Input
                  value={ex.value}
                  onChange={(e) => rx.updateExam(ex.id, { value: e.target.value })}
                  placeholder={L.findingValue[lang]}
                  className="h-7 w-36 shrink-0 text-sm"
                  disabled={locked}
                />
                <RowRemove onClick={() => rx.removeExam(ex.id)} disabled={locked} title={t("delete")} />
              </div>
            ))}
            <LibraryCombobox
              category="EXAM"
              placeholder={L.addFinding[lang]}
              onSelect={(item) => rx.addExam(item.labelEn, item.labelBn || undefined)}
              disabled={locked}
            />
          </div>
        </Section>

        {/* 5. Diagnosis ---------------------------------------------------------- */}
        <Section icon={<StethoscopeIcon className="size-4" />} title={t("diagnosis")} count={d.diagnosis.length}>
          {d.diagnosis.map((dg) => (
            <div key={dg.id} className="flex items-start gap-1.5">
              <Select
                value={dg.type}
                onValueChange={(val) =>
                  rx.updateDiagnosis(dg.id, { type: val === "primary" ? "primary" : "secondary" })
                }
                disabled={locked}
              >
                <SelectTrigger
                  size="sm"
                  className={cn(
                    "mt-0.5 w-[100px] shrink-0",
                    dg.type === "primary" && "border-teal-600/50 text-teal-700 dark:text-teal-400"
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">{t("primary")}</SelectItem>
                  <SelectItem value="secondary">{t("secondary")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="min-w-0 flex-1">
                <Input
                  value={dg.label}
                  onChange={(e) => rx.updateDiagnosis(dg.id, { label: e.target.value })}
                  className="h-8 text-sm"
                  disabled={locked}
                />
                {dg.labelBn ? (
                  <div className="truncate px-1 text-[11px] text-muted-foreground">{dg.labelBn}</div>
                ) : null}
              </div>
              {dg.icd10 ? (
                <Badge
                  variant="outline"
                  className="mt-1 shrink-0 border-teal-600/40 font-mono text-[10px] font-normal text-teal-700 dark:text-teal-400"
                >
                  {dg.icd10}
                </Badge>
              ) : null}
              <RowRemove onClick={() => rx.removeDiagnosis(dg.id)} disabled={locked} title={t("delete")} />
            </div>
          ))}
          <LibraryPicker
            category="DIAGNOSIS"
            title={t("diagnosis")}
            triggerLabel={t("addDiagnosis")}
            badge="code"
            onAdd={(items) =>
              items.forEach((item) =>
                rx.addDiagnosis(item.labelEn, item.labelBn || undefined, item.code || undefined)
              )
            }
            disabled={locked}
          />
        </Section>

        {/* 6. Investigations ------------------------------------------------------ */}
        <Section
          icon={<FlaskConicalIcon className="size-4" />}
          title={t("investigations")}
          count={d.investigations.length}
        >
          <div className="flex flex-wrap gap-1.5">
            {d.investigations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-0.5 rounded-md border bg-background/60 py-0.5 pr-0.5 pl-2"
              >
                <span className="max-w-52 truncate text-xs">{inv.label}</span>
                <Input
                  value={inv.note ?? ""}
                  onChange={(e) => rx.updateInvestigation(inv.id, { note: e.target.value })}
                  placeholder={L.note[lang]}
                  className="h-6 w-24 border-none bg-transparent px-1 text-xs shadow-none focus-visible:ring-1"
                  disabled={locked}
                />
                <button
                  type="button"
                  onClick={() => rx.removeInvestigation(inv.id)}
                  disabled={locked}
                  title={t("delete")}
                  className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <LibraryPicker
            category="INVESTIGATION"
            title={t("investigations")}
            triggerLabel={t("addInvestigation")}
            badge="subcategory"
            onAdd={(items) => items.forEach((item) => rx.addInvestigation(item.labelEn))}
            disabled={locked}
          />
        </Section>

        {/* 7. Medicines ------------------------------------------------------------ */}
        <Section icon={<PillIcon className="size-4" />} title={t("medicines")} count={d.medicines.length}>
          <div className="space-y-1.5">
            {d.medicines.map((m, i) => (
              <MedicineLineEditor
                key={m._uid}
                line={m}
                index={i}
                total={d.medicines.length}
                collapsed={!expandedMeds.has(m._uid)}
                onToggle={() => toggleMed(m._uid)}
                disabled={locked}
              />
            ))}
            <button
              type="button"
              onClick={() => setMedDialogOpen(true)}
              disabled={locked}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-teal-600/40 px-3 py-2.5 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-500/40 dark:text-teal-400 dark:hover:bg-teal-950/30"
            >
              <PlusIcon className="size-4" />
              {t("addMedicine")}
            </button>
            <MedicineSearchDialog
              open={medDialogOpen}
              onOpenChange={setMedDialogOpen}
              onSelect={handleMedicinePicked}
            />
          </div>
        </Section>

        {/* 8. Advice ----------------------------------------------------------------- */}
        <Section icon={<LightbulbIcon className="size-4" />} title={t("advice")} count={d.advice.length}>
          <div className="flex flex-wrap gap-1.5">
            {d.advice.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1 rounded-full border bg-background/60 py-0.5 pr-1 pl-2.5"
              >
                <span className="max-w-64 truncate text-xs">
                  {lang === "bn" && a.labelBn ? a.labelBn : a.label}
                </span>
                {a.labelBn && lang !== "bn" ? (
                  <Badge variant="secondary" className="px-1 text-[10px] font-normal">
                    {a.labelBn}
                  </Badge>
                ) : null}
                <button
                  type="button"
                  onClick={() => rx.removeAdvice(a.id)}
                  disabled={locked}
                  title={t("delete")}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <LibraryPicker
            category="ADVICE"
            title={t("advice")}
            triggerLabel={t("addAdvice")}
            badge="subcategory"
            onAdd={(items) =>
              items.forEach((item) => rx.addAdvice(item.labelEn, item.labelBn || undefined))
            }
            disabled={locked}
          />
        </Section>

        {/* 9. Follow-up & Notes -------------------------------------------------------- */}
        <Section icon={<CalendarClockIcon className="size-4" />} title={t("followUp")}>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{t("followUpDate")}</div>
              <Input
                type="date"
                value={d.followUp.date ? d.followUp.date.slice(0, 10) : ""}
                onChange={(e) => rx.setFollowUp({ date: e.target.value })}
                className="h-8 text-sm"
                disabled={locked}
              />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{t("followUpNote")}</div>
              <Input
                value={d.followUp.note ?? ""}
                onChange={(e) => rx.setFollowUp({ note: e.target.value })}
                className="h-8 text-sm"
                disabled={locked}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {FOLLOW_UP_CHIPS.map(([en, bn]) => (
              <ChipButton
                key={en}
                label={lang === "bn" ? bn : en}
                disabled={locked}
                onClick={() => rx.setFollowUp({ note: lang === "bn" ? bn : en })}
              />
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">
              {t("notes")} <span className="opacity-60">({L.internalOnly[lang]})</span>
            </div>
            <Textarea
              rows={2}
              value={rx.notes}
              onChange={(e) => rx.setNotes(e.target.value)}
              disabled={locked}
              className="min-h-0 text-sm"
            />
          </div>
        </Section>
      </div>

      {/* sticky action bar */}
      <div className="flex items-center gap-1.5 border-t bg-background/95 px-2.5 py-2 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-teal-600/50 text-teal-700 hover:bg-teal-50 dark:border-teal-500/50 dark:text-teal-400 dark:hover:bg-teal-950/40"
          onClick={() => void doSave()}
          disabled={locked || rx.saving}
        >
          {rx.saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
          {t("saveDraft")}
        </Button>
        {canFinalize ? (
          <Button
            type="button"
            size="sm"
            className="bg-teal-600 text-white hover:bg-teal-700"
            onClick={() => setFinalDialogOpen(true)}
            disabled={locked || rx.saving}
          >
            <FileCheckIcon className="size-4" />
            {t("finalize")}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Badge
            variant={rx.status === "FINALIZED" ? "default" : "outline"}
            className={cn(
              "text-[10px]",
              rx.status === "FINALIZED"
                ? "border-transparent bg-teal-600 text-white"
                : "border-amber-500/60 text-amber-600 dark:text-amber-400"
            )}
          >
            {rx.status === "FINALIZED" ? t("finalized") : t("draft")}
          </Badge>
          {rx.dirty && !locked ? <span className="size-1.5 rounded-full bg-amber-500" title={L.unsaved[lang]} /> : null}
        </div>
      </div>

      {/* finalize confirm */}
      <AlertDialog open={finalDialogOpen} onOpenChange={setFinalDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{t("finalize")}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {L.confirmFinalize[lang]}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={(e) => {
                e.preventDefault();
                setFinalDialogOpen(false);
                void doFinalize();
              }}
            >
              {t("finalize")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* revision dialog */}
      <Dialog open={revDialogOpen} onOpenChange={setRevDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{t("createRevision")}</DialogTitle>
            <DialogDescription className="text-xs">{t("revisionNote")}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder={L.revisionPh[lang]}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRevDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void doRevise()}
              disabled={rx.saving}
            >
              {rx.saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("createRevision")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EditorPanel;
