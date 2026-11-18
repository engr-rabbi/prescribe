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

export function permissionsOf(userId: string): string[] {
  return tables.userPermissions.filter((p) => p.userId === userId && p.allowed).map((p) => p.permission);
}

export function sessionUserFromRow(user: UserRow): SessionUser {
  let doctorId: string | undefined;
  if (user.role === "DOCTOR") doctorId = tables.doctors.find((d) => d.userId === user.id)?.id;
  else if (user.role === "ASSISTANT") doctorId = user.doctorId ?? undefined;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    doctorId,
    patientUid: user.patientUid ?? undefined,
    mustChangePassword: user.mustChangePassword,
    permissions: user.role === "ASSISTANT" ? permissionsOf(user.id) : [],
  };
}

/** An account may only be used while it (and, for assistants, its doctor) is ACTIVE. */
export function accountUsable(user: UserRow): boolean {
  if (!user.active || user.status !== "ACTIVE") return false;
  if (user.role === "ASSISTANT") {
    const boss = tables.doctors.find((d) => d.id === user.doctorId);
    const bossUser = boss && tables.users.find((u) => u.id === boss.userId);
    if (!bossUser || bossUser.status !== "ACTIVE" || !bossUser.active) return false;
    const rel = tables.relationships.find((r) => r.userId === user.id && r.doctorId === user.doctorId);
    if (rel && rel.status !== "ACTIVE") return false;
  }
  return true;
}

export function getSessionUser(): SessionUser | null {
  const token = runtime.sessions.currentToken();
  if (!token) return null;
  const userId = runtime.sessions.userIdFor(token);
  if (!userId) return null;
  const user = tables.users.find((u) => u.id === userId);
  if (!user || !accountUsable(user)) return null;
  return sessionUserFromRow(user);
}

export function requireUser(opts: { allowPasswordChange?: boolean } = {}): SessionUser {
  const user = getSessionUser();
  if (!user) throw new HttpError(401, "Authentication required");
  // server-side enforcement of the forced first-login password change — not just a UI screen
  if (user.mustChangePassword && !opts.allowPasswordChange) {
    throw new HttpError(403, "PASSWORD_CHANGE_REQUIRED: you must set a new password before continuing");
  }
  return user;
}

export function requireRole(...roles: SessionUser["role"][]): SessionUser {
  const user = requireUser();
  if (!roles.includes(user.role)) throw new HttpError(403, "Insufficient permissions");
  return user;
}

export function can(user: SessionUser, permission: string): boolean {
  if (user.role === "DOCTOR") return true;
  if (user.role === "ASSISTANT") return user.permissions.includes(permission);
  return false;
}

/**
 * The doctor whose data this request may touch. DOCTOR → themselves; ASSISTANT → the doctor they work
 * for (and only if the doctor granted `permission`); everyone else → 403. This is THE choke point that
 * keeps clinics isolated from each other: handlers never take a doctor id from the request.
 */
export function clinicScope(permission?: string): { user: SessionUser; doctorId: string } {
  const user = requireUser();
  if ((user.role !== "DOCTOR" && user.role !== "ASSISTANT") || !user.doctorId) {
    throw new HttpError(403, "Insufficient permissions");
  }
  if (permission && !can(user, permission)) throw new HttpError(403, "Insufficient permissions");
  return { user, doctorId: user.doctorId };
}

export function firstDoctor(): DoctorRow | undefined {
  return [...tables.doctors].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function requireDoctorContext(): { user: SessionUser; doctorId: string } {
  return clinicScope();
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
    username: u.username,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    status: u.status,
    active: u.active,
    doctorId: u.role === "ASSISTANT" ? u.doctorId : u.role === "DOCTOR" ? (tables.doctors.find((d) => d.userId === u.id)?.id ?? null) : null,
    patientUid: u.patientUid,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
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
    patientUid: p.patientUid ?? undefined,
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

/** A prescription is in scope for the doctor who owns it and for that doctor's assistants (if permitted). */
export function inScope(user: SessionUser, rx: { doctorId: string }): boolean {
  if (!user.doctorId || rx.doctorId !== user.doctorId) return false;
  if (user.role === "DOCTOR") return true;
  return user.role === "ASSISTANT" && user.permissions.includes("prescriptions.view");
}

/** Only the owning doctor may finalize / revise / sign. Assistants and admins never can. */
export function assertPrescriptionOwner(rx: { doctorId: string }, user: SessionUser, verb: string) {
  if (user.role === "DOCTOR" && user.doctorId && rx.doctorId === user.doctorId) return;
  throw new HttpError(403, `Only the owning doctor can ${verb} this prescription`);
}

/** Drafts may be written by the doctor, or by an assistant the doctor allowed to do consultation data entry. */
export function assertCanWriteDraft(rx: { doctorId: string }, user: SessionUser) {
  if (user.doctorId !== rx.doctorId) throw new HttpError(404, "Prescription not found");
  if (user.role === "DOCTOR") return;
  if (user.role === "ASSISTANT" && user.permissions.includes("consultation.dataentry")) return;
  throw new HttpError(403, "Insufficient permissions");
}

/** A patient record is private to one doctor. Anything else looks like "not found". */
export function patientInScope(user: SessionUser, p: { doctorId: string | null }): boolean {
  return !!user.doctorId && p.doctorId === user.doctorId;
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

// ---------------------------------------------------------------------------
// identifiers
// ---------------------------------------------------------------------------

const nextSeq = (values: string[]) =>
  values.reduce((max, v) => {
    const n = Number(v.split("-").pop());
    return Number.isFinite(n) && n > max ? n : max;
  }, 0) + 1;

/** PAT-2026-000001 — unique, permanent, searchable. The sequence never restarts, so UIDs can't collide across years. */
export function generatePatientUid(when: Date = new Date()): string {
  const seq = nextSeq(tables.patientProfiles.map((p) => p.patientUid));
  return `PAT-${when.getFullYear()}-${String(seq).padStart(6, "0")}`;
}

/** DOC-2026-0001 */
export function generateDoctorCode(when: Date = new Date()): string {
  const seq = nextSeq(tables.doctors.map((d) => d.code).filter(Boolean));
  return `DOC-${when.getFullYear()}-${String(seq).padStart(4, "0")}`;
}

export function usernameTaken(username: string, exceptUserId?: string): boolean {
  const u = username.toLowerCase();
  return tables.users.some((x) => (x.username ?? "").toLowerCase() === u && x.id !== exceptUserId);
}

export function uniqueUsername(base: string): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[^a-z0-9]+/, "").slice(0, 24) || "user";
  const padded = clean.length < 3 ? `${clean}user`.slice(0, 6) : clean;
  if (!usernameTaken(padded)) return padded;
  for (let i = 2; i < 10_000; i++) if (!usernameTaken(`${padded}${i}`)) return `${padded}${i}`;
  return `${padded}${Date.now()}`;
}
