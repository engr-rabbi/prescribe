// Auth guards, audit logging and row → DTO mappers for the in-browser backend.
// Mirrors the behaviour of the original server (src/lib/auth.ts + serialize.ts).

import { EMPTY_HISTORY } from "@/lib/types";
import type {
  AdviceItem,
  ChamberDTO,
  ChiefComplaint,
  DiagnosisItem,
  DoctorProfileDTO,
  ExamFinding,
  HistorySection,
  InvestigationItem,
  LibraryItemDTO,
  PatientDTO,
  PrescriptionDTO,
  PrescriptionMedicineDTO,
  SessionUser,
  UserDTO,
  Vitals,
  TemplateConfig,
} from "@/lib/types";
import { HttpError } from "./errors";
import { newId } from "./crypto";
import { runtime } from "./runtime";
import {
  tables,
  touch,
  isServerMode,
  queueAudit,
  type AuditRow,
  type ChamberRow,
  type DoctorRow,
  type LibraryRow,
  type PatientRow,
  type RxMedRow,
  type RxRow,
  type UserRow,
} from "./store";

export { HttpError };

// ---------------------------------------------------------------------------
// Sessions (provider-based: localStorage + IndexedDB in the browser build,
// signed stateless tokens in the Google Apps Script build)
// ---------------------------------------------------------------------------

export function createSession(userId: string): string {
  return runtime.sessions.create(userId);
}

export function destroySession() {
  runtime.sessions.destroy();
}

export function sessionUserFromRow(user: UserRow): SessionUser {
  const doctor = tables.doctors.find((d) => d.userId === user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    doctorId: doctor?.id,
  };
}

export function getSessionUser(): SessionUser | null {
  const token = runtime.sessions.currentToken();
  if (!token) return null;
  const userId = runtime.sessions.userIdFor(token);
  if (!userId) return null;
  const user = tables.users.find((u) => u.id === userId);
  if (!user || !user.active) return null;
  return sessionUserFromRow(user);
}

export function requireUser(): SessionUser {
  const user = getSessionUser();
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}

export function requireRole(...roles: SessionUser["role"][]): SessionUser {
  const user = requireUser();
  if (!roles.includes(user.role)) throw new HttpError(403, "Insufficient permissions");
  return user;
}

export function firstDoctor(): DoctorRow | undefined {
  return [...tables.doctors].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function requireDoctorContext(): { user: SessionUser; doctorId: string } {
  const user = requireUser();
  if (user.role === "DOCTOR" && user.doctorId) return { user, doctorId: user.doctorId };
  const doc = firstDoctor();
  if (doc && (user.role === "SUPER_ADMIN" || user.role === "ASSISTANT")) {
    return { user, doctorId: doc.id };
  }
  throw new HttpError(403, "Doctor profile required");
}

export function audit(
  user: SessionUser | null,
  action: string,
  entity: string,
  entityId = "",
  details = ""
) {
  try {
    const row: AuditRow = {
      id: newId(),
      userId: user?.id ?? null,
      userEmail: user?.email ?? "",
      userRole: user?.role ?? "",
      action,
      entity,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };
    if (isServerMode()) {
      queueAudit(row); // appended to the AuditLogs sheet at the end of the request
    } else {
      tables.auditLogs.push(row);
      touch("auditLogs");
    }
  } catch {
    // never break a request because of audit logging
  }
}

// ---------------------------------------------------------------------------
// JSON column helpers
// ---------------------------------------------------------------------------

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw) as T | null;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}
function parseArray<T>(raw: string): T[] {
  const parsed = parseJSON<unknown>(raw, []);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}
export function parseTemplateConfig(raw: string): TemplateConfig {
  return parseJSON<TemplateConfig>(raw, {});
}

// ---------------------------------------------------------------------------
// DTO mappers (never leak passwordHash)
// ---------------------------------------------------------------------------

export function toUserDTO(u: UserRow): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
  };
}

export function toDoctorProfileDTO(d: DoctorRow): DoctorProfileDTO {
  return {
    id: d.id,
    userId: d.userId,
    fullName: d.fullName,
    professionalTitle: d.professionalTitle,
    specialization: d.specialization,
    bmdcNo: d.bmdcNo,
    designation: d.designation,
    hospitalName: d.hospitalName,
    chamberAddress: d.chamberAddress,
    phone: d.phone,
    email: d.email,
    photoUrl: runtime.assets.resolve(d.photoUrl),
    signatureUrl: runtime.assets.resolve(d.signatureUrl),
    logoUrl: runtime.assets.resolve(d.logoUrl),
    consultationSchedule: d.consultationSchedule,
    headerNote: d.headerNote,
    footerNote: d.footerNote,
    activeTemplate: d.activeTemplate,
    themeColor: d.themeColor,
    fontFamily: d.fontFamily,
    headerLayout: d.headerLayout,
    showLogo: d.showLogo,
    showPhoto: d.showPhoto,
  };
}

export function toPatientDTO(p: PatientRow, withMeta = false): PatientDTO {
  let prescriptionCount: number | undefined;
  let lastVisit: string | null = null;
  if (withMeta) {
    const mine = tables.prescriptions.filter((r) => r.patientId === p.id);
    prescriptionCount = mine.length;
    lastVisit =
      mine.reduce<string | null>(
        (max, r) => (max === null || r.prescriptionDate > max ? r.prescriptionDate : max),
        null
      ) ?? null;
  }
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    ageYears: p.ageYears ?? null,
    ageMonths: p.ageMonths ?? null,
    dob: p.dob ?? null,
    gender: p.gender,
    mobile: p.mobile,
    address: p.address,
    weight: p.weight ?? null,
    height: p.height ?? null,
    bloodGroup: p.bloodGroup,
    allergies: p.allergies,
    medicalHistory: p.medicalHistory,
    createdAt: p.createdAt,
    prescriptionCount,
    lastVisit,
  };
}

export function toChamberDTO(c: ChamberRow): ChamberDTO {
  return {
    id: c.id,
    doctorId: c.doctorId,
    name: c.name,
    address: c.address,
    days: c.days,
    time: c.time,
    phone: c.phone,
    serialInfo: c.serialInfo,
    isPrimary: c.isPrimary,
    sortOrder: c.sortOrder,
  };
}

export function toPrescriptionMedicineDTO(m: RxMedRow): PrescriptionMedicineDTO {
  return {
    id: m.id,
    sortOrder: m.sortOrder,
    medicineId: m.medicineId,
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
  };
}

export function toPrescriptionDTO(p: RxRow): PrescriptionDTO {
  const patient = tables.patients.find((x) => x.id === p.patientId);
  const doctor = tables.doctors.find((x) => x.id === p.doctorId);
  if (!patient || !doctor) throw new HttpError(500, "Prescription has missing patient or doctor");
  const chamber = p.chamberId ? tables.chambers.find((c) => c.id === p.chamberId) ?? null : null;
  const exam = parseJSON<{ vitals?: Vitals; examinations?: ExamFinding[] }>(p.examination, {});
  return {
    id: p.id,
    code: p.code,
    status: p.status === "FINALIZED" ? "FINALIZED" : "DRAFT",
    version: p.version,
    rootId: p.rootId,
    revisionNote: p.revisionNote,
    prescriptionDate: p.prescriptionDate,
    chiefComplaints: parseArray<ChiefComplaint>(p.chiefComplaints),
    history: { ...EMPTY_HISTORY, ...parseJSON<Partial<HistorySection>>(p.history, {}) },
    examination: {
      vitals: exam.vitals ?? {},
      examinations: Array.isArray(exam.examinations) ? exam.examinations : [],
    },
    diagnosis: parseArray<DiagnosisItem>(p.diagnosis),
    investigations: parseArray<InvestigationItem>(p.investigations),
    advice: parseArray<AdviceItem>(p.advice),
    followUpDate: p.followUpDate,
    followUpNote: p.followUpNote,
    template: p.template,
    templateConfig: p.templateConfig,
    notes: p.notes,
    finalizedAt: p.finalizedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    patient: toPatientDTO(patient),
    doctor: toDoctorProfileDTO(doctor),
    chamberId: p.chamberId,
    chamber: chamber ? toChamberDTO(chamber) : null,
    medicines: tables.prescriptionMedicines
      .filter((m) => m.prescriptionId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(toPrescriptionMedicineDTO),
  };
}

export function toLibraryItemDTO(i: LibraryRow): LibraryItemDTO {
  return {
    id: i.id,
    category: i.category,
    subcategory: i.subcategory,
    labelEn: i.labelEn,
    labelBn: i.labelBn,
    code: i.code,
    isCustom: i.isCustom,
    usageCount: i.usageCount,
  };
}

// ---------------------------------------------------------------------------
// Access-control & code helpers
// ---------------------------------------------------------------------------

/** DOCTOR → only own prescriptions; ASSISTANT / SUPER_ADMIN → everything. */
export function inScope(user: SessionUser, rx: { doctorId: string }): boolean {
  if (user.role === "DOCTOR") return !!user.doctorId && rx.doctorId === user.doctorId;
  return true;
}

export function assertPrescriptionOwner(rx: { doctorId: string }, user: SessionUser, verb: string) {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role === "DOCTOR" && user.doctorId && rx.doctorId === user.doctorId) return;
  throw new HttpError(403, `Only the owning doctor can ${verb} this prescription`);
}

export function dayBounds(d: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function generatePatientCode(): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `PID-${String(tables.patients.length + 1 + attempt).padStart(6, "0")}`;
    if (!tables.patients.some((p) => p.code === code)) return code;
  }
  return `PID-${Date.now()}`;
}

export function generatePrescriptionCode(when: Date = new Date()): string {
  const stamp =
    `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, "0")}` +
    `${String(when.getDate()).padStart(2, "0")}`;
  const prefix = `RX-${stamp}-`;
  const count = tables.prescriptions.filter((r) => r.code.startsWith(prefix)).length;
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = `${prefix}${String(count + 1 + attempt).padStart(4, "0")}`;
    if (!tables.prescriptions.some((r) => r.code === code)) return code;
  }
  return `${prefix}${String(Date.now()).slice(-6)}`;
}
