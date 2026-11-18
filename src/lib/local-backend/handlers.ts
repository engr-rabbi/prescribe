// Port of every original /api/* route handler, running against the in-browser
// store. Same validation, permissions, status rules and audit trail.

import type { DashboardStats } from "@/lib/types";
import { EMPTY_HISTORY } from "@/lib/types";
import { hashPassword, newId, verifyPassword } from "./crypto";
import { runtime } from "./runtime";
import type { AssetKind } from "./runtime";
import {
  HttpError,
  assertCanWriteDraft,
  assertPrescriptionOwner,
  audit,
  can,
  clinicScope,
  dayBounds,
  generatePatientCode,
  generatePrescriptionCode,
  inScope,
  parseTemplateConfig,
  requireRole,
  requireUser,
  toChamberDTO,
  toDoctorProfileDTO,
  toLibraryItemDTO,
  toPatientDTO,
  toPrescriptionDTO,
} from "./core";
import { catalogueStats, dosageForms, reimportCatalogue, searchMedicines } from "./medicines";
import {
  changePasswordSchema,
  createUserSchema,
  libraryCreateSchema,
  loginSchema,
  normalizePrescriptionBody,
  patientCreateSchema,
  patientUpdateSchema,
  prescriptionUpdateSchema,
  prescriptionUpsertSchema,
  profileUpdateSchema,
  reviseSchema,
  templateSchema,
  updateUserSchema,
  LIBRARY_CATEGORIES,
  type PrescriptionDataInput,
} from "./schemas";
import { readAuditTail, tables, touch, type DoctorRow, type LibraryRow, type RxMedRow, type RxRow } from "./store";
import { catalogueColumns } from "./medicines";

/** Minimal query-string reader (URLSearchParams is not available in Apps Script). */
export interface Query {
  get(key: string): string | null;
  has(key: string): boolean;
}

export interface Ctx {
  params: Record<string, string>;
  query: Query;
  body: unknown;
}
export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

const now = () => new Date().toISOString();
/** Doctor-only write access to the clinic's own configuration (templates …). */
function ownDoctor() {
  const user = requireRole("DOCTOR");
  if (!user.doctorId) throw new HttpError(403, "Doctor profile required");
  return { user, doctorId: user.doctorId };
}

const asRecord = (b: unknown) => (b && typeof b === "object" ? (b as Record<string, unknown>) : null);
const ci = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());
const paging = (sp: Query) => ({
  page: Math.max(1, Number(sp.get("page")) || 1),
  limit: Math.min(100, Math.max(1, Number(sp.get("limit")) || 20)),
});

// ---------------------------------------------------------------------------
// clinical column builders
// ---------------------------------------------------------------------------

function clinicalFieldsFromData(d: PrescriptionDataInput) {
  return {
    chiefComplaints: JSON.stringify(d.chiefComplaints ?? []),
    history: JSON.stringify(d.history ?? EMPTY_HISTORY),
    examination: JSON.stringify({ vitals: d.vitals ?? {}, examinations: d.examinations ?? [] }),
    diagnosis: JSON.stringify(d.diagnosis ?? []),
    investigations: JSON.stringify(d.investigations ?? []),
    advice: JSON.stringify(d.advice ?? []),
    followUpDate: d.followUp?.date ? new Date(d.followUp.date).toISOString() : null,
    followUpNote: d.followUp?.note ?? "",
  };
}

function medicineRows(prescriptionId: string, meds: PrescriptionDataInput["medicines"]): RxMedRow[] {
  return meds.map((m, index) => ({
    id: newId(),
    prescriptionId,
    sortOrder: index,
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
  }));
}

function replaceMedicines(prescriptionId: string, rows: RxMedRow[]) {
  tables.prescriptionMedicines = tables.prescriptionMedicines.filter((m) => m.prescriptionId !== prescriptionId);
  tables.prescriptionMedicines.push(...rows);
  touch("prescriptionMedicines");
}

function copyMedicines(fromId: string, toId: string) {
  const rows = tables.prescriptionMedicines
    .filter((m) => m.prescriptionId === fromId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({ ...m, id: newId(), prescriptionId: toId }));
  tables.prescriptionMedicines.push(...rows);
  touch("prescriptionMedicines");
}

/** Looks a prescription up inside the caller's clinic — another doctor's id is "not found". */
function getRx(id: string, user: { doctorId?: string }): RxRow {
  const rx = tables.prescriptions.find((r) => r.id === id);
  if (!rx || !user.doctorId || rx.doctorId !== user.doctorId) throw new HttpError(404, "Prescription not found");
  return rx;
}


// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------------

export const dashboard: Handler = () => {
  const user = requireUser();
  const { start, end } = dayBounds();
  const startMs = start.getTime();
  const endMs = end.getTime();
  const admin = user.role === "SUPER_ADMIN";
  if (!admin && !(user.doctorId && (user.role === "DOCTOR" || user.role === "ASSISTANT"))) {
    throw new HttpError(403, "Insufficient permissions");
  }
  // clinic users only ever count / list their OWN doctor's data; the super admin gets aggregate numbers only
  const patients = admin ? tables.patients : tables.patients.filter((p) => p.doctorId === user.doctorId);
  const scoped = admin ? tables.prescriptions : tables.prescriptions.filter((r) => r.doctorId === user.doctorId);
  const today = scoped.filter((r) => {
    const t = new Date(r.prescriptionDate).getTime();
    return t >= startMs && t < endMs;
  });
  const seeRx = !admin && inScope(user, { doctorId: user.doctorId! });
  const seePatients = !admin && can(user, "patients.view");

  const upcomingFollowUps = !seeRx
    ? []
    : scoped
        .filter((r) => r.status === "FINALIZED" && r.followUpDate && new Date(r.followUpDate).getTime() >= startMs)
        .sort((a, b) => (a.followUpDate! < b.followUpDate! ? -1 : 1))
        .slice(0, 10)
        .map((rx) => {
          const p = tables.patients.find((x) => x.id === rx.patientId);
          const d = tables.doctors.find((x) => x.id === rx.doctorId);
          return { id: rx.id, code: rx.code, patientName: p?.name ?? "", patientCode: p?.code ?? "", followUpDate: rx.followUpDate ?? "", doctorName: d?.fullName ?? "" };
        });

  const recentPrescriptions = !seeRx
    ? []
    : [...scoped]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 8)
        .map((rx) => {
          const p = tables.patients.find((x) => x.id === rx.patientId);
          const d = tables.doctors.find((x) => x.id === rx.doctorId);
          return { id: rx.id, code: rx.code, status: rx.status, prescriptionDate: rx.prescriptionDate, patientName: p?.name ?? "", patientCode: p?.code ?? "", doctorName: d?.fullName ?? "" };
        });

  const stats: DashboardStats = {
    totalPatients: patients.length,
    todayPatients: new Set(today.map((r) => r.patientId)).size,
    totalPrescriptions: scoped.length,
    todayPrescriptions: today.length,
    upcomingFollowUps,
    recentPatients: seePatients
      ? [...patients].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5).map((p) => toPatientDTO(p))
      : [],
    recentPrescriptions,
  };
  return { stats };
};

// ---------------------------------------------------------------------------
// doctor profile / chambers / templates
// ---------------------------------------------------------------------------

export const getProfile: Handler = () => {
  const { doctorId } = clinicScope(); // a doctor sees their own profile, an assistant their doctor's (read-only)
  const doctor = tables.doctors.find((d) => d.id === doctorId);
  if (!doctor) throw new HttpError(404, "Doctor profile not found");
  return { profile: toDoctorProfileDTO(doctor) };
};

export const updateProfile: Handler = ({ body }) => {
  const user = requireRole("DOCTOR");
  if (!user.doctorId) throw new HttpError(404, "Doctor profile not found");
  const data = profileUpdateSchema.parse(body);
  const doctor = tables.doctors.find((d) => d.id === user.doctorId);
  if (!doctor) throw new HttpError(404, "Doctor profile not found");
  const assetKinds: Record<string, AssetKind> = {
    photoUrl: "DOCTOR_PHOTO",
    signatureUrl: "DOCTOR_SIGNATURE",
    logoUrl: "CLINIC_LOGO",
  };
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k in assetKinds) {
      const current = (doctor as unknown as Record<string, string>)[k];
      // the form sends back what it received; only a new data-URL (or "") changes the stored file
      const unchanged = v === runtime.assets.resolve(current) || v === current;
      if (unchanged) continue;
      (doctor as unknown as Record<string, unknown>)[k] = v
        ? runtime.assets.store(doctor.id, assetKinds[k], String(v), user.id)
        : "";
    } else {
      (doctor as unknown as Record<string, unknown>)[k] = v;
    }
  }
  doctor.updatedAt = now();
  touch("doctors");
  audit(user, "UPDATE", "DOCTOR", doctor.id, "Updated doctor profile");
  return { profile: toDoctorProfileDTO(doctor) };
};

type ChamberBody = {
  name?: string;
  address?: string;
  days?: string;
  time?: string;
  phone?: string;
  serialInfo?: string;
  isPrimary?: boolean;
} | null;

export const listChambers: Handler = () => {
  const { doctorId } = clinicScope();
  const chambers = tables.chambers
    .filter((c) => c.doctorId === doctorId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return { chambers: chambers.map(toChamberDTO) };
};

export const createChamber: Handler = ({ body }) => {
  const user = requireRole("DOCTOR");
  if (!user.doctorId) throw new HttpError(404, "Doctor profile not found");
  const b = asRecord(body) as ChamberBody;
  const name = (b?.name ?? "").trim();
  if (!name) throw new HttpError(400, "name: Clinic / Hospital / Chamber Name is required");

  const count = tables.chambers.filter((c) => c.doctorId === user.doctorId).length;
  const makePrimary = b?.isPrimary === true || count === 0;
  if (makePrimary) {
    for (const c of tables.chambers) if (c.doctorId === user.doctorId) c.isPrimary = false;
  }
  const t = now();
  const chamber = {
    id: newId(),
    doctorId: user.doctorId,
    name,
    address: b?.address ?? "",
    days: b?.days ?? "",
    time: b?.time ?? "",
    phone: b?.phone ?? "",
    serialInfo: b?.serialInfo ?? "",
    isPrimary: makePrimary,
    sortOrder: count,
    createdAt: t,
    updatedAt: t,
  };
  tables.chambers.push(chamber);
  touch("chambers");
  audit(user, "CREATE", "CHAMBER", chamber.id, chamber.name);
  return { chamber: toChamberDTO(chamber) };
};

function ownedChamber(doctorId: string | undefined, id: string) {
  if (!doctorId) throw new HttpError(404, "Doctor profile not found");
  const chamber = tables.chambers.find((c) => c.id === id);
  if (!chamber || chamber.doctorId !== doctorId) throw new HttpError(404, "Chamber not found");
  return chamber;
}

export const updateChamber: Handler = ({ params, body }) => {
  const user = requireRole("DOCTOR");
  const chamber = ownedChamber(user.doctorId, params.id);
  const b = asRecord(body) as ChamberBody;
  const name = b?.name;
  if (name !== undefined && !name.trim()) {
    throw new HttpError(400, "name: Clinic / Hospital / Chamber Name is required");
  }
  if (b?.isPrimary === true) {
    for (const c of tables.chambers) if (c.doctorId === user.doctorId) c.isPrimary = false;
  }
  if (name !== undefined) chamber.name = name.trim();
  if (b?.address !== undefined) chamber.address = b.address;
  if (b?.days !== undefined) chamber.days = b.days;
  if (b?.time !== undefined) chamber.time = b.time;
  if (b?.phone !== undefined) chamber.phone = b.phone;
  if (b?.serialInfo !== undefined) chamber.serialInfo = b.serialInfo;
  if (b?.isPrimary !== undefined) chamber.isPrimary = b.isPrimary === true;
  chamber.updatedAt = now();
  touch("chambers");
  audit(user, "UPDATE", "CHAMBER", chamber.id, chamber.name);
  return { chamber: toChamberDTO(chamber) };
};

export const deleteChamber: Handler = ({ params }) => {
  const user = requireRole("DOCTOR");
  const chamber = ownedChamber(user.doctorId, params.id);
  tables.chambers = tables.chambers.filter((c) => c.id !== chamber.id);
  // prescriptions keep working (onDelete: SetNull)
  for (const rx of tables.prescriptions) if (rx.chamberId === chamber.id) rx.chamberId = null;
  touch("chambers", "prescriptions");
  audit(user, "DELETE", "CHAMBER", chamber.id, chamber.name);
  return { ok: true };
};

export const listTemplates: Handler = () => {
  const { doctorId } = clinicScope();
  const templates = tables.templates
    .filter((t) => t.doctorId === doctorId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      templateKey: t.templateKey,
      config: parseTemplateConfig(t.config),
      isDefault: t.isDefault,
    })),
  };
};

export const saveTemplate: Handler = ({ body }) => {
  const { doctorId } = ownDoctor();
  const parsed = templateSchema.parse(body);
  const configJson = JSON.stringify(parsed.config ?? {});
  const clearOthers = (keepId?: string) => {
    for (const t of tables.templates) if (t.doctorId === doctorId && t.id !== keepId) t.isDefault = false;
  };

  if (parsed.id) {
    const existing = tables.templates.find((t) => t.id === parsed.id);
    if (!existing || existing.doctorId !== doctorId) throw new HttpError(404, "Template not found");
    if (parsed.isDefault) clearOthers(parsed.id);
    existing.name = parsed.name;
    existing.templateKey = parsed.templateKey;
    existing.config = configJson;
    existing.isDefault = parsed.isDefault;
    existing.updatedAt = now();
  } else {
    if (parsed.isDefault) clearOthers();
    const t = now();
    tables.templates.push({
      id: newId(),
      doctorId,
      name: parsed.name,
      templateKey: parsed.templateKey,
      config: configJson,
      isDefault: parsed.isDefault,
      createdAt: t,
      updatedAt: t,
    });
  }
  touch("templates");
  return { ok: true };
};

export const deleteTemplate: Handler = ({ query }) => {
  const { doctorId } = ownDoctor();
  const id = query.get("id");
  if (!id) throw new HttpError(400, "Query parameter 'id' is required");
  const existing = tables.templates.find((t) => t.id === id);
  if (!existing || existing.doctorId !== doctorId) throw new HttpError(404, "Template not found");
  tables.templates = tables.templates.filter((t) => t.id !== id);
  touch("templates");
  return { ok: true };
};

// ---------------------------------------------------------------------------
// patients
// ---------------------------------------------------------------------------

export const listPatients: Handler = ({ query }) => {
  const { doctorId } = clinicScope("patients.view");
  const q = (query.get("q") ?? "").trim();
  const { page, limit } = paging(query);
  const filtered = tables.patients.filter(
    (p) => p.doctorId === doctorId && (!q || ci(p.name, q) || ci(p.mobile, q) || ci(p.code, q) || ci(p.patientUid ?? "", q))
  );
  const rows = [...filtered]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice((page - 1) * limit, page * limit);
  return { items: rows.map((p) => toPatientDTO(p, true)), total: filtered.length };
};

/** A patient record is private to its doctor: someone else's id is simply "not found". */
function ownPatient(user: { doctorId?: string }, id: string) {
  const patient = tables.patients.find((p) => p.id === id);
  if (!patient || !user.doctorId || patient.doctorId !== user.doctorId) throw new HttpError(404, "Patient not found");
  return patient;
}

export const getPatient: Handler = ({ params }) => {
  const { user } = clinicScope("patients.view");
  return { patient: toPatientDTO(ownPatient(user, params.id), true) };
};

export const createPatient: Handler = ({ body }) => {
  const { user, doctorId } = clinicScope("patients.register");
  const b = patientCreateSchema.parse(body);
  const t = now();
  const patient = {
    id: newId(),
    code: generatePatientCode(),
    name: b.name,
    ageYears: b.ageYears ?? null,
    ageMonths: b.ageMonths ?? null,
    dob: b.dob ? b.dob.toISOString() : null,
    gender: b.gender,
    mobile: b.mobile,
    address: b.address,
    weight: b.weight ?? null,
    height: b.height ?? null,
    bloodGroup: b.bloodGroup,
    allergies: b.allergies,
    medicalHistory: b.medicalHistory,
    createdById: user.id,
    createdAt: t,
    updatedAt: t,
    doctorId,
    patientUid: null,
  };
  tables.patients.push(patient);
  touch("patients");
  audit(user, "CREATE", "PATIENT", patient.id, `${patient.code} — ${patient.name}`);
  return { patient: toPatientDTO(patient) };
};

export const updatePatient: Handler = ({ params, body }) => {
  const { user } = clinicScope("patients.register");
  const b = patientUpdateSchema.parse(body);
  const patient = ownPatient(user, params.id);
  if (b.name !== undefined) patient.name = b.name;
  if (b.ageYears !== undefined) patient.ageYears = b.ageYears;
  if (b.ageMonths !== undefined) patient.ageMonths = b.ageMonths;
  if (b.dob !== undefined) patient.dob = b.dob ? b.dob.toISOString() : null;
  if (b.gender !== undefined) patient.gender = b.gender;
  if (b.mobile !== undefined) patient.mobile = b.mobile;
  if (b.address !== undefined) patient.address = b.address;
  if (b.weight !== undefined) patient.weight = b.weight;
  if (b.height !== undefined) patient.height = b.height;
  if (b.bloodGroup !== undefined) patient.bloodGroup = b.bloodGroup;
  if (b.allergies !== undefined) patient.allergies = b.allergies;
  if (b.medicalHistory !== undefined) patient.medicalHistory = b.medicalHistory;
  patient.updatedAt = now();
  touch("patients");
  audit(user, "UPDATE", "PATIENT", patient.id, `${patient.code} — ${patient.name}`);
  return { patient: toPatientDTO(patient, true) };
};

export const patientConsultations: Handler = ({ params }) => {
  const { user } = clinicScope("patients.view");
  ownPatient(user, params.id);
  const rows = tables.prescriptions
    .filter((r) => r.patientId === params.id && inScope(user, r))
    .sort((a, b) => (a.prescriptionDate < b.prescriptionDate ? 1 : -1));
  return { prescriptions: rows.map(toPrescriptionDTO) };
};

// ---------------------------------------------------------------------------
// prescriptions
// ---------------------------------------------------------------------------

export const listPrescriptions: Handler = ({ query }) => {
  const { user } = clinicScope("prescriptions.view");
  const q = (query.get("q") ?? "").trim();
  const patientId = query.get("patientId") ?? undefined;
  const rootId = query.get("rootId") ?? undefined;
  const status = query.get("status") ?? undefined;
  if (status && status !== "DRAFT" && status !== "FINALIZED") {
    throw new HttpError(400, "status must be DRAFT or FINALIZED");
  }
  const { page, limit } = paging(query);

  const filtered = tables.prescriptions.filter((r) => {
    if (!inScope(user, r)) return false;
    if (patientId && r.patientId !== patientId) return false;
    if (rootId && r.rootId !== rootId) return false;
    if (status && r.status !== status) return false;
    if (q) {
      const p = tables.patients.find((x) => x.id === r.patientId);
      if (!p || !(ci(p.name, q) || ci(p.code, q))) return false;
    }
    return true;
  });
  const rows = [...filtered]
    .sort((a, b) => (a.prescriptionDate < b.prescriptionDate ? 1 : -1))
    .slice((page - 1) * limit, page * limit);
  return { items: rows.map(toPrescriptionDTO), total: filtered.length };
};

export const getPrescription: Handler = ({ params }) => {
  const { user } = clinicScope("prescriptions.view");
  return { prescription: toPrescriptionDTO(getRx(params.id, user)) };
};

/** Writing draft prescriptions: the doctor, or an assistant the doctor allowed to do consultation data entry. */
function draftWriter() {
  const { user, doctorId } = clinicScope();
  if (user.role !== "DOCTOR" && !can(user, "consultation.dataentry")) throw new HttpError(403, "Insufficient permissions");
  return { user, doctorId };
}

function checkChamber(doctorId: string, chamberId: string | null | undefined) {
  if (chamberId && !tables.chambers.some((c) => c.id === chamberId && c.doctorId === doctorId)) {
    throw new HttpError(400, "chamberId: unknown chamber");
  }
}

export const upsertPrescription: Handler = ({ body }) => {
  const { user, doctorId } = draftWriter();
  const parsed = prescriptionUpsertSchema.parse(normalizePrescriptionBody(body));
  const patient = tables.patients.find((p) => p.id === parsed.patientId);
  if (!patient || patient.doctorId !== doctorId) throw new HttpError(400, "Patient not found");
  checkChamber(doctorId, parsed.chamberId);

  if (parsed.id) {
    const existing = getRx(parsed.id, user);
    if (existing.status !== "DRAFT") {
      throw new HttpError(409, "Finalized prescriptions are immutable — use revise");
    }
    assertCanWriteDraft(existing, user);
    existing.patientId = parsed.patientId;
    Object.assign(existing, clinicalFieldsFromData(parsed.data));
    if (parsed.template !== undefined) existing.template = parsed.template;
    if (parsed.templateConfig !== undefined) existing.templateConfig = JSON.stringify(parsed.templateConfig);
    if (parsed.notes !== undefined) existing.notes = parsed.notes;
    if (parsed.chamberId !== undefined) existing.chamberId = parsed.chamberId;
    existing.updatedAt = now();
    touch("prescriptions");
    replaceMedicines(existing.id, medicineRows(existing.id, parsed.data.medicines));
    audit(user, "UPDATE", "PRESCRIPTION", existing.id, existing.code);
    return { prescription: toPrescriptionDTO(existing) };
  }

  const t = now();
  const id = newId();
  const rx: RxRow = {
    id,
    code: generatePrescriptionCode(),
    patientId: parsed.patientId,
    doctorId,
    status: "DRAFT",
    version: 1,
    rootId: null,
    revisionNote: "",
    supersededById: null,
    prescriptionDate: t,
    ...clinicalFieldsFromData(parsed.data),
    template: parsed.template ?? "modern",
    templateConfig: JSON.stringify(parsed.templateConfig ?? {}),
    notes: parsed.notes ?? "",
    finalizedAt: null,
    finalizedById: null,
    createdAt: t,
    updatedAt: t,
    chamberId: parsed.chamberId ?? null,
  };
  tables.prescriptions.push(rx);
  touch("prescriptions");
  replaceMedicines(id, medicineRows(id, parsed.data.medicines));
  audit(user, "CREATE", "PRESCRIPTION", id, `${rx.code} — ${patient.code} ${patient.name}`);
  return { prescription: toPrescriptionDTO(rx) };
};

export const updatePrescription: Handler = ({ params, body }) => {
  const { user, doctorId } = draftWriter();
  const parsed = prescriptionUpdateSchema.parse(normalizePrescriptionBody(body));
  const existing = getRx(params.id, user);
  if (existing.status !== "DRAFT") {
    throw new HttpError(409, "Finalized prescriptions are immutable — use revise");
  }
  assertCanWriteDraft(existing, user);
  const target = tables.patients.find((p) => p.id === parsed.patientId);
  if (!target || target.doctorId !== doctorId) throw new HttpError(400, "Patient not found");
  existing.patientId = parsed.patientId;
  Object.assign(existing, clinicalFieldsFromData(parsed.data));
  if (parsed.template !== undefined) existing.template = parsed.template;
  if (parsed.templateConfig !== undefined) existing.templateConfig = JSON.stringify(parsed.templateConfig);
  if (parsed.notes !== undefined) existing.notes = parsed.notes;
  existing.updatedAt = now();
  touch("prescriptions");
  replaceMedicines(existing.id, medicineRows(existing.id, parsed.data.medicines));
  audit(user, "UPDATE", "PRESCRIPTION", existing.id, existing.code);
  return { prescription: toPrescriptionDTO(existing) };
};

export const deletePrescription: Handler = ({ params }) => {
  const { user } = draftWriter();
  const existing = getRx(params.id, user);
  if (existing.status !== "DRAFT") throw new HttpError(409, "Only draft prescriptions can be deleted");
  assertCanWriteDraft(existing, user);
  tables.prescriptions = tables.prescriptions.filter((r) => r.id !== existing.id);
  tables.prescriptionMedicines = tables.prescriptionMedicines.filter((m) => m.prescriptionId !== existing.id);
  touch("prescriptions", "prescriptionMedicines");
  audit(user, "DELETE", "PRESCRIPTION", existing.id, existing.code);
  return { ok: true };
};

export const finalizePrescription: Handler = ({ params }) => {
  const user = requireRole("DOCTOR"); // assistants and admins can never finalize / sign
  const existing = getRx(params.id, user);
  assertPrescriptionOwner(existing, user, "finalize");
  if (existing.status === "FINALIZED") throw new HttpError(409, "Prescription is already finalized");
  existing.status = "FINALIZED";
  existing.finalizedAt = now();
  existing.finalizedById = user.id;
  existing.updatedAt = existing.finalizedAt;
  touch("prescriptions");
  audit(user, "FINALIZE", "PRESCRIPTION", existing.id, existing.code);
  return { prescription: toPrescriptionDTO(existing) };
};

function cloneForNewDraft(original: RxRow, extra: Partial<RxRow>): RxRow {
  const t = now();
  return {
    id: newId(),
    code: generatePrescriptionCode(),
    patientId: original.patientId,
    doctorId: original.doctorId,
    status: "DRAFT",
    version: 1,
    rootId: null,
    revisionNote: "",
    supersededById: null,
    prescriptionDate: t,
    chiefComplaints: original.chiefComplaints,
    history: original.history,
    examination: original.examination,
    diagnosis: original.diagnosis,
    investigations: original.investigations,
    advice: original.advice,
    followUpDate: original.followUpDate,
    followUpNote: original.followUpNote,
    template: original.template,
    templateConfig: original.templateConfig,
    notes: original.notes,
    finalizedAt: null,
    finalizedById: null,
    createdAt: t,
    updatedAt: t,
    chamberId: null,
    ...extra,
  };
}

export const revisePrescription: Handler = ({ params, body }) => {
  const user = requireRole("DOCTOR"); // only the owner doctor revises
  const parsed = reviseSchema.parse(body ?? {});
  const original = getRx(params.id, user);
  assertPrescriptionOwner(original, user, "revise");
  if (original.status !== "FINALIZED") {
    throw new HttpError(400, "Only finalized prescriptions can be revised — edit the draft instead");
  }
  const created = cloneForNewDraft(original, {
    version: original.version + 1,
    rootId: original.rootId ?? original.id,
    revisionNote: parsed.revisionNote,
  });
  tables.prescriptions.push(created);
  copyMedicines(original.id, created.id);
  original.supersededById = created.id; // pointer only — content/status untouched
  touch("prescriptions");
  audit(user, "REVISE", "PRESCRIPTION", created.id, `${original.code} → ${created.code} (v${created.version})`);
  return { prescription: toPrescriptionDTO(created) };
};

export const duplicatePrescription: Handler = ({ params }) => {
  const { user } = draftWriter();
  const original = getRx(params.id, user);
  assertCanWriteDraft(original, user);
  const created = cloneForNewDraft(original, { notes: `Duplicated from ${original.code}` });
  tables.prescriptions.push(created);
  copyMedicines(original.id, created.id);
  touch("prescriptions");
  audit(user, "CREATE", "PRESCRIPTION", created.id, `Duplicated from ${original.code}`);
  return { prescription: toPrescriptionDTO(created) };
};

// ---------------------------------------------------------------------------
// medicines & libraries
// ---------------------------------------------------------------------------

export const searchMedicinesHandler: Handler = async ({ query }) => {
  clinicScope();
  const q = (query.get("q") ?? "").trim();
  const form = (query.get("form") ?? "").trim();
  const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 40));
  return searchMedicines(q, form, limit);
};

export const medicineForms: Handler = async () => {
  clinicScope();
  return { forms: await dosageForms() };
};

/** Pure library query (also used by the browser to filter its local mirror of the Google sheets). */
export function queryLibrary(
  all: LibraryRow[],
  category: string,
  q: string,
  subcategory: string
): { items: LibraryRow[]; subcategories: string[] } {
  const inCategory = all.filter((i) => i.category === category);
  const items = inCategory
    .filter((i) => !subcategory || subcategory === "ALL" || i.subcategory === subcategory)
    .filter((i) => !q || ci(i.labelEn, q) || ci(i.labelBn, q) || ci(i.code, q))
    .sort(
      (a, b) =>
        b.usageCount - a.usageCount || (a.labelEn < b.labelEn ? -1 : a.labelEn > b.labelEn ? 1 : 0)
    )
    .slice(0, 200);
  const subcategories = [...new Set(inCategory.map((i) => i.subcategory))].sort((a, b) =>
    a.localeCompare(b)
  );
  return { items, subcategories };
}

/** Shared master entries + the custom entries of THIS doctor's clinic only. */
const visibleLibrary = (doctorId: string) =>
  tables.libraryItems.filter((i) => !i.isCustom || i.doctorId === doctorId);

export const listLibrary: Handler = ({ query }) => {
  const { doctorId } = clinicScope();
  const category = query.get("category") ?? "";
  if (!(LIBRARY_CATEGORIES as readonly string[]).includes(category)) {
    throw new HttpError(400, `category must be one of: ${LIBRARY_CATEGORIES.join(" | ")}`);
  }
  const { items, subcategories } = queryLibrary(
    visibleLibrary(doctorId),
    category,
    (query.get("q") ?? "").trim(),
    (query.get("subcategory") ?? "").trim()
  );
  return { items: items.map(toLibraryItemDTO), subcategories };
};

/** Whole library in one call — the browser filters it locally (keystroke-speed search). */
export const libraryAll: Handler = () => {
  const { doctorId } = clinicScope();
  return { items: visibleLibrary(doctorId).map(toLibraryItemDTO) };
};

/** Whole medicine catalogue in compact column form (cached in IndexedDB by the browser). */
export const medicineCatalogue: Handler = async () => {
  clinicScope();
  return { ...(await catalogueColumns()), version: runtime.catalogueVersion() };
};

export const medicineVersion: Handler = () => {
  clinicScope();
  return { version: runtime.catalogueVersion() };
};

export const addLibraryItem: Handler = ({ body }) => {
  const { user, doctorId } = clinicScope();
  const parsed = libraryCreateSchema.parse(body);
  const duplicate = visibleLibrary(doctorId).find(
    (i) => i.category === parsed.category && i.labelEn === parsed.labelEn
  );
  if (duplicate) return { item: toLibraryItemDTO(duplicate) };
  const item = {
    id: newId(),
    category: parsed.category,
    subcategory: parsed.subcategory,
    labelEn: parsed.labelEn,
    labelBn: parsed.labelBn,
    code: parsed.code,
    keywords: "",
    isCustom: true,
    createdById: user.id,
    usageCount: 0,
    createdAt: now(),
    doctorId,
  };
  tables.libraryItems.push(item);
  touch("libraryItems");
  audit(user, "CREATE", "LIBRARY", item.id, `${item.category}: ${item.labelEn}`);
  return { item: toLibraryItemDTO(item) };
};

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export const auditLogs: Handler = ({ query }) => {
  requireRole("SUPER_ADMIN");
  const limit = Math.min(500, Math.max(1, Number(query.get("limit")) || 100));
  const rows = readAuditTail(limit) ?? tables.auditLogs; // server build: tail of the AuditLogs sheet
  const logs = [...rows].reverse().slice(0, limit); // appended chronologically
  return { logs };
};

export const medicineStats: Handler = async () => {
  requireRole("SUPER_ADMIN");
  return catalogueStats();
};

export const importMedicines: Handler = async () => {
  const admin = requireRole("SUPER_ADMIN");
  const report = await reimportCatalogue();
  audit(
    admin,
    "IMPORT",
    "MEDICINE",
    "",
    `imported=${report.imported} skipped=${report.skipped} errors=${report.errors.length}`
  );
  return report;
};
