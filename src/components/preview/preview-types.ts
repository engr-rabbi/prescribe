// Shared template props + pure rendering helpers for the A4 prescription
// preview templates (modern / clinical / classic).

import type { CSSProperties } from "react";
import type {
  ChamberDTO,
  DoctorProfileDTO,
  HistorySection,
  MedicineLine,
  PatientDTO,
  PrescriptionData,
  TemplateConfig,
  Vitals,
} from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { abbreviateForm, calcBMI, formatPatientAge, formatMedicineLine } from "@/lib/rx-utils";

// ---------------------------------------------------------------------------
// Common props every A4 template receives
// ---------------------------------------------------------------------------

export interface TemplateProps {
  /** Full clinical payload (complaints, vitals, medicines, advice, …) */
  data: PrescriptionData;
  /** Doctor header data (null => render graceful placeholders) */
  doctor: DoctorProfileDTO | null;
  /** Selected patient (null while creating a new prescription) */
  patient: PatientDTO | null;
  /** Chamber shown for this prescription (null => legacy header fields) */
  chamber?: ChamberDTO | null;
  /** Prescription code, e.g. "RX-20250101-0007" ("" for unsaved drafts) */
  code: string;
  /** "DRAFT" | "FINALIZED" */
  status: string;
  /** Pre-formatted prescription date string (today for new prescriptions) */
  dateText: string;
  /** Doctor's template config merged over DEFAULT_TEMPLATE_CONFIG */
  config: TemplateConfig;
  /** UI language — clinical content renders in the language it was entered in */
  lang: Lang;
  /** Revision counter (clinical template shows a revision note when > 1) */
  version: number;
}

// ---------------------------------------------------------------------------
// Font stacks — Bengali-safe fallbacks applied inline to user-entered content
// ---------------------------------------------------------------------------

export const BN_STACK = "'Noto Sans Bengali', 'SolaimanLipi', sans-serif";
export const SANS_STACK = "'Segoe UI', system-ui, -apple-system, sans-serif";
export const SERIF_STACK = "Georgia, 'Times New Roman', serif";

/** Inline style appending the Bengali fallback after an optional base stack. */
export function bnStyle(base?: string): CSSProperties {
  return { fontFamily: base ? `${base}, ${BN_STACK}` : BN_STACK };
}

// ---------------------------------------------------------------------------
// Vitals → "BP = 130/80 mmHg" style entries (empty values omitted)
// ---------------------------------------------------------------------------

export interface VitalEntry {
  label: string;
  value: string;
}

export function vitalEntries(v: Vitals): VitalEntry[] {
  const entries: VitalEntry[] = [];
  const sys = (v.bpSystolic ?? "").trim();
  const dia = (v.bpDiastolic ?? "").trim();
  if (sys && dia) entries.push({ label: "BP", value: `${sys}/${dia} mmHg` });
  else if (sys || dia) entries.push({ label: "BP", value: `${sys || dia} mmHg` });
  if ((v.pulse ?? "").trim()) entries.push({ label: "Pulse", value: `${v.pulse!.trim()} /min` });
  if ((v.temperature ?? "").trim()) entries.push({ label: "Temp", value: `${v.temperature!.trim()} °F` });
  if ((v.respiratoryRate ?? "").trim()) entries.push({ label: "RR", value: `${v.respiratoryRate!.trim()} /min` });
  if ((v.spo2 ?? "").trim()) entries.push({ label: "SpO₂", value: `${v.spo2!.trim()} %` });
  if ((v.height ?? "").trim()) entries.push({ label: "Height", value: `${v.height!.trim()} cm` });
  if ((v.weight ?? "").trim()) entries.push({ label: "Weight", value: `${v.weight!.trim()} kg` });
  const bmi = calcBMI(v.weight, v.height);
  if (bmi) entries.push({ label: "BMI", value: bmi });
  return entries;
}

// ---------------------------------------------------------------------------
// Patient bar: Name / Age,Sex / Weight / Date
// ---------------------------------------------------------------------------

export interface PatientBarInfo {
  name: string;
  age: string;
  sex: string;
  weight: string;
}

export function patientBarInfo(data: PrescriptionData, patient: PatientDTO | null): PatientBarInfo {
  const gender = (patient?.gender ?? "").trim();
  const sex = gender ? gender.charAt(0).toUpperCase() : "";
  const weight =
    (data.vitals.weight ?? "").trim() ||
    (patient?.weight != null ? String(patient.weight) : "");
  return {
    name: (patient?.name ?? "").trim(),
    age: patient ? formatPatientAge(patient) : "",
    sex,
    weight,
  };
}

// ---------------------------------------------------------------------------
// Medicine rendering helpers
// ---------------------------------------------------------------------------

/** Bold part: "Tab. NAPA 500 mg" (or the whole custom text line). */
export function medicineName(m: MedicineLine): string {
  if (m.customText.trim()) return m.customText.trim();
  return [abbreviateForm(m.dosageForm), m.brandName.trim(), m.strength.trim()]
    .filter(Boolean)
    .join(" ");
}

/** Detail part via formatMedicineLine: "1+0+1 — After meal — 7 days". */
export function medicineDetail(m: MedicineLine): string {
  if (m.customText.trim()) return "";
  return formatMedicineLine({
    ...m,
    dosageForm: "",
    brandName: "",
    strength: "",
    customText: "",
  });
}

/** Classic pad style: "1+0+1 (After meal) — 7 days". */
export function classicMedicineDetail(m: MedicineLine): string {
  if (m.customText.trim()) return "";
  const freq = [m.dose.trim(), m.frequency.trim()].filter(Boolean).join(" ");
  const meal = m.mealTiming.trim() ? `(${m.mealTiming.trim()})` : "";
  const head = [freq, meal].filter(Boolean).join(" ");
  const parts: string[] = [];
  if (head) parts.push(head);
  if (m.duration.trim()) parts.push(m.duration.trim());
  return parts.join(" — ");
}

// ---------------------------------------------------------------------------
// History — only non-empty sections are printed (all 14 categories)
// ---------------------------------------------------------------------------

export const HISTORY_SECTIONS: readonly { key: keyof HistorySection; short: string }[] = [
  { key: "presentIllness", short: "H/O Present Illness" },
  { key: "pastMedical", short: "Past Medical H/O" },
  { key: "pastSurgical", short: "Past Surgical H/O" },
  { key: "drugHistory", short: "Drug H/O" },
  { key: "familyHistory", short: "Family H/O" },
  { key: "personalHistory", short: "Personal H/O" },
  { key: "socialHistory", short: "Social H/O" },
  { key: "allergyHistory", short: "Allergy H/O" },
  { key: "occupationalHistory", short: "Occupational H/O" },
  { key: "menstrualHistory", short: "Menstrual H/O" },
  { key: "obstetricHistory", short: "Obstetric H/O" },
  { key: "immunizationHistory", short: "Immunization H/O" },
  { key: "dietaryHistory", short: "Dietary H/O" },
  { key: "previousInvestigations", short: "Prev. Investigations" },
] as const;

export function nonEmptyHistory(h: HistorySection): { short: string; text: string }[] {
  return HISTORY_SECTIONS
    .map((s) => ({ short: s.short, text: (h[s.key] ?? "").trim() }))
    .filter((s) => s.text.length > 0);
}

// ---------------------------------------------------------------------------
// Diagnosis — primary first, stable ordering
// ---------------------------------------------------------------------------

export function orderedDiagnosis(data: PrescriptionData): PrescriptionData["diagnosis"] {
  return [...data.diagnosis].sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === "primary" ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------
// Chamber display — bold "Clinic / Hospital / Chamber Name" + small details;
// falls back to the legacy Doctor.chamberAddress lines when no chamber exists.
// ---------------------------------------------------------------------------

export interface ChamberDisplay {
  /** Clinic / Hospital / Chamber Name ("" => no chamber selected) */
  name: string;
  /** small-print lines: address, days+time, phone, serial booking */
  detailLines: string[];
  /** legacy fallback lines from Doctor.chamberAddress */
  legacyLines: string[];
}

export function chamberDisplay(
  chamber: ChamberDTO | null | undefined,
  doctor: DoctorProfileDTO | null
): ChamberDisplay {
  const legacyLines = (doctor?.chamberAddress ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!chamber) return { name: "", detailLines: [], legacyLines };
  const c = chamber;
  const hasAny =
    [c.name, c.address, c.days, c.time, c.phone, c.serialInfo].some((v) => v.trim().length > 0);
  if (!hasAny) return { name: "", detailLines: [], legacyLines };

  const lines: string[] = [];
  const address = c.address.trim();
  if (address) lines.push(...address.split("\n").map((l) => l.trim()).filter(Boolean));
  const when = [c.days.trim(), c.time.trim()].filter(Boolean).join(", ");
  if (when) lines.push(when);
  if (c.phone.trim()) lines.push(`Phone: ${c.phone.trim()}`);
  if (c.serialInfo.trim()) lines.push(c.serialInfo.trim());
  return { name: c.name.trim(), detailLines: lines, legacyLines: [] };
}

// ---------------------------------------------------------------------------
// Shared text bits
// ---------------------------------------------------------------------------

export function doctorDegrees(doctor: DoctorProfileDTO | null): string {
  if (!doctor) return "";
  return [doctor.professionalTitle, doctor.specialization].filter((s) => s && s.trim()).join(", ");
}

export function doctorRegLine(doctor: DoctorProfileDTO | null): string {
  if (!doctor?.bmdcNo?.trim()) return "";
  return `BMDC Reg. No: ${doctor.bmdcNo.trim()}`;
}
