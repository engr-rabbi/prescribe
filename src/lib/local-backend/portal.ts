// Patient portal + doctor-side access to patient accounts.
//
// Privacy model
//  • A patient account (PAT-YYYY-NNNNNN) is global. Any doctor can FIND it (UID / name / mobile / email) and
//    sees a minimal card — contact details masked, no medical data.
//  • Medical information, reports and forms need the patient's explicit, revocable consent (DoctorPatientAccess).
//  • Every search / view / request / consultation start is written to the audit log.
//  • Doctors' own patient records (Patients sheet) stay private to that doctor whatever the global account says.

import { newId } from "./crypto";
import {
  HttpError,
  audit,
  can,
  clinicScope,
  generatePatientCode,
  requireRole,
  toPatientDTO,
  toPrescriptionDTO,
} from "./core";
import type { Handler } from "./handlers";
import {
  answersSchema,
  appointmentCreateSchema,
  appointmentUpdateSchema,
  patientProfileSchema,
  questionnaireSchema,
} from "./schemas";
import { tables, touch, type AccessRow, type AppointmentRow, type PatientProfileRow, type QuestionnaireRow } from "./store";

const now = () => new Date().toISOString();
const j = <T,>(raw: string, fallback: T): T => {
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ProfileDTO {
  patientUid: string;
  fullName: string;
  dob: string | null;
  ageYears: number | null;
  gender: string;
  mobile: string;
  email: string;
  address: string;
  weight: number | null;
  height: number | null;
  bloodGroup: string;
  allergies: string;
  conditions: string;
  history: string;
  medications: string;
  surgeries: string;
  familyHistory: string;
  other: string;
  customFields: { id: string; label: string; value: string; updatedAt: string }[];
  /** last-updated date of every individual field */
  fieldUpdated: Record<string, string>;
  updatedAt: string;
}

const MEDICAL_KEYS = ["allergies", "conditions", "history", "medications", "surgeries", "familyHistory", "other", "weight", "height", "bloodGroup"] as const;
const PROFILE_KEYS = ["fullName", "dob", "ageYears", "gender", "mobile", "email", "address", ...MEDICAL_KEYS] as const;

function toProfileDTO(p: PatientProfileRow): ProfileDTO {
  return {
    patientUid: p.patientUid, fullName: p.fullName, dob: p.dob, ageYears: p.ageYears, gender: p.gender, mobile: p.mobile,
    email: p.email, address: p.address, weight: p.weight, height: p.height, bloodGroup: p.bloodGroup, allergies: p.allergies,
    conditions: p.conditions, history: p.history, medications: p.medications, surgeries: p.surgeries,
    familyHistory: p.familyHistory, other: p.other, customFields: j(p.customFields, []), fieldUpdated: j(p.fieldUpdated, {}),
    updatedAt: p.updatedAt,
  };
}

const maskMobile = (m: string) => (m.length > 4 ? `${m.slice(0, 3)}${"•".repeat(Math.max(0, m.length - 5))}${m.slice(-2)}` : m ? "••••" : "");
const maskEmail = (e: string) => {
  const [l, d] = e.split("@");
  return d ? `${l.slice(0, 2)}${"•".repeat(Math.max(1, l.length - 2))}@${d}` : "";
};

function myProfile(uid: string | undefined): PatientProfileRow {
  const p = tables.patientProfiles.find((x) => x.patientUid === uid);
  if (!p) throw new HttpError(404, "Patient profile not found");
  return p;
}

function consentOf(uid: string, doctorId: string): AccessRow | undefined {
  return tables.accessGrants.find(
    (a) => a.patientUid === uid && a.doctorId === doctorId && a.status === "GRANTED" && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
  );
}
export const hasConsent = (uid: string, doctorId: string) => !!consentOf(uid, doctorId);

const doctorName = (id: string) => tables.doctors.find((d) => d.id === id)?.fullName ?? "";

// ---------------------------------------------------------------------------
// patient: profile
// ---------------------------------------------------------------------------

export const getMyProfile: Handler = () => {
  const user = requireRole("PATIENT");
  return { profile: toProfileDTO(myProfile(user.patientUid)) };
};

export const updateMyProfile: Handler = ({ body }) => {
  const user = requireRole("PATIENT");
  const p = patientProfileSchema.parse(body);
  const row = myProfile(user.patientUid);
  const stamps = j<Record<string, string>>(row.fieldUpdated, {});
  const t = now();
  const rec = row as unknown as Record<string, unknown>;
  for (const key of PROFILE_KEYS) {
    const raw = (p as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    const next = key === "dob" ? (raw ? new Date(raw as string).toISOString() : null) : raw;
    if (rec[key] !== next) {
      rec[key] = next;
      stamps[key] = t; // per-field "last updated"
    }
  }
  if (p.customFields) {
    const old = j<ProfileDTO["customFields"]>(row.customFields, []);
    const merged = p.customFields.map((c) => {
      const prev = old.find((o) => o.id === c.id);
      const unchanged = prev && prev.label === c.label && prev.value === c.value;
      return { id: prev?.id ?? c.id ?? newId(), label: c.label, value: c.value, updatedAt: unchanged ? prev!.updatedAt : t };
    });
    if (JSON.stringify(merged) !== JSON.stringify(old)) stamps.customFields = t;
    row.customFields = JSON.stringify(merged);
  }
  row.fieldUpdated = JSON.stringify(stamps);
  row.updatedAt = t;
  touch("patientProfiles");
  audit(user, "UPDATE", "PATIENT_ACCOUNT", row.patientUid, "Patient updated own profile");
  return { profile: toProfileDTO(row) };
};

// ---------------------------------------------------------------------------
// patient: prescriptions (published only) + doctors directory
// ---------------------------------------------------------------------------

export const myPrescriptions: Handler = () => {
  const user = requireRole("PATIENT");
  const records = tables.patients.filter((p) => p.patientUid === user.patientUid).map((p) => p.id);
  const list = tables.prescriptions
    .filter((r) => records.includes(r.patientId) && r.status === "FINALIZED")
    .sort((a, b) => (a.prescriptionDate < b.prescriptionDate ? 1 : -1));
  return {
    prescriptions: list.map((r) => {
      const dto = toPrescriptionDTO(r);
      const pdf = tables.files.filter((f) => !f.deleted && f.kind === "PRESCRIPTION_PDF" && f.relatedId === r.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
      // patients get the published prescription only — never the doctor's private notes
      return { ...dto, notes: "", pdfFileId: pdf?.id ?? null };
    }),
  };
};

export const doctorDirectory: Handler = () => {
  requireRole("PATIENT");
  const doctors = tables.doctors.filter((d) => {
    const u = tables.users.find((x) => x.id === d.userId);
    return u && u.status === "ACTIVE";
  });
  return {
    doctors: doctors.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.fullName,
      title: d.professionalTitle,
      specialization: d.specialization,
      hospitalName: d.hospitalName,
      chambers: tables.chambers.filter((c) => c.doctorId === d.id).map((c) => ({ id: c.id, name: c.name, days: c.days, time: c.time })),
    })),
  };
};

// ---------------------------------------------------------------------------
// patient: consent (access permissions)
// ---------------------------------------------------------------------------

function accessDTO(a: AccessRow) {
  return { ...a, doctorName: doctorName(a.doctorId) };
}

export const myAccess: Handler = () => {
  const user = requireRole("PATIENT");
  const rows = tables.accessGrants.filter((a) => a.patientUid === user.patientUid).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { access: rows.map(accessDTO) };
};

function upsertAccess(uid: string, doctorId: string, status: AccessRow["status"], source: string, note = ""): AccessRow {
  const t = now();
  let row = tables.accessGrants.find((a) => a.patientUid === uid && a.doctorId === doctorId && (a.status === "REQUESTED" || a.status === "GRANTED"));
  if (!row) {
    row = { id: newId(), patientUid: uid, doctorId, status, source, requestedAt: t, respondedAt: null, revokedAt: null, expiresAt: null, note, updatedAt: t };
    tables.accessGrants.push(row);
  }
  row.status = status;
  row.updatedAt = t;
  if (status === "GRANTED" || status === "DENIED") row.respondedAt = t;
  touch("accessGrants");
  return row;
}

export const grantAccess: Handler = ({ body }) => {
  const user = requireRole("PATIENT");
  const doctorId = String((body as Record<string, unknown> | null)?.doctorId ?? "");
  if (!tables.doctors.some((d) => d.id === doctorId)) throw new HttpError(404, "Doctor not found");
  const row = upsertAccess(user.patientUid!, doctorId, "GRANTED", "PATIENT_GRANT");
  audit(user, "ACCESS_GRANT", "PATIENT_ACCOUNT", user.patientUid!, `doctor ${doctorId}`);
  return { access: accessDTO(row) };
};

function ownAccess(uid: string | undefined, id: string): AccessRow {
  const a = tables.accessGrants.find((x) => x.id === id && x.patientUid === uid);
  if (!a) throw new HttpError(404, "Access record not found");
  return a;
}

export const respondAccess: Handler = ({ params, body }) => {
  const user = requireRole("PATIENT");
  const a = ownAccess(user.patientUid, params.id);
  const action = String((body as Record<string, unknown> | null)?.action ?? "");
  if (a.status !== "REQUESTED") throw new HttpError(409, "This request has already been answered");
  if (action !== "grant" && action !== "deny") throw new HttpError(400, "action must be grant or deny");
  a.status = action === "grant" ? "GRANTED" : "DENIED";
  a.respondedAt = now();
  a.updatedAt = a.respondedAt;
  touch("accessGrants");
  audit(user, action === "grant" ? "ACCESS_GRANT" : "ACCESS_DENY", "PATIENT_ACCOUNT", a.patientUid, `doctor ${a.doctorId}`);
  return { access: accessDTO(a) };
};

export const revokeAccess: Handler = ({ params }) => {
  const user = requireRole("PATIENT");
  const a = ownAccess(user.patientUid, params.id);
  if (a.status !== "GRANTED") throw new HttpError(409, "Only active permissions can be withdrawn");
  a.status = "REVOKED";
  a.revokedAt = now();
  a.updatedAt = a.revokedAt;
  touch("accessGrants");
  audit(user, "ACCESS_REVOKE", "PATIENT_ACCOUNT", a.patientUid, `doctor ${a.doctorId}`);
  return { access: accessDTO(a) };
};

// ---------------------------------------------------------------------------
// patient: appointments
// ---------------------------------------------------------------------------

export const myAppointments: Handler = () => {
  const user = requireRole("PATIENT");
  const rows = tables.appointments.filter((a) => a.patientUid === user.patientUid).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { appointments: rows.map((a) => ({ ...a, doctorName: doctorName(a.doctorId) })) };
};

export const requestAppointment: Handler = ({ body }) => {
  const user = requireRole("PATIENT");
  const p = appointmentCreateSchema.parse(body);
  const doctor = tables.doctors.find((d) => d.id === p.doctorId);
  const docUser = doctor && tables.users.find((u) => u.id === doctor.userId);
  if (!doctor || !docUser || docUser.status !== "ACTIVE") throw new HttpError(404, "Doctor not found");
  if (p.chamberId && !tables.chambers.some((c) => c.id === p.chamberId && c.doctorId === p.doctorId)) throw new HttpError(400, "chamberId: unknown chamber");
  const profile = myProfile(user.patientUid);
  const t = now();
  const row: AppointmentRow = {
    id: newId(), patientUid: profile.patientUid, patientName: profile.fullName, doctorId: p.doctorId, chamberId: p.chamberId ?? null,
    preferredDate: p.preferredDate, preferredTime: p.preferredTime, reason: p.reason, status: "REQUESTED", scheduledAt: null,
    doctorNote: "", shareMedical: p.shareMedical, createdAt: t, updatedAt: t,
  };
  tables.appointments.push(row);
  touch("appointments");
  if (p.shareMedical) {
    upsertAccess(profile.patientUid, p.doctorId, "GRANTED", "APPOINTMENT");
    audit(user, "ACCESS_GRANT", "PATIENT_ACCOUNT", profile.patientUid, `doctor ${p.doctorId} (with appointment request)`);
  }
  audit(user, "CREATE", "APPOINTMENT", row.id, `${profile.patientUid} → ${doctor.fullName}`);
  return { appointment: { ...row, doctorName: doctor.fullName } };
};

export const cancelAppointment: Handler = ({ params }) => {
  const user = requireRole("PATIENT");
  const a = tables.appointments.find((x) => x.id === params.id && x.patientUid === user.patientUid);
  if (!a) throw new HttpError(404, "Appointment not found");
  if (a.status !== "REQUESTED" && a.status !== "CONFIRMED") throw new HttpError(409, "This appointment can no longer be cancelled");
  a.status = "CANCELLED";
  a.updatedAt = now();
  touch("appointments");
  audit(user, "UPDATE", "APPOINTMENT", a.id, "cancelled by patient");
  return { appointment: { ...a, doctorName: doctorName(a.doctorId) } };
};

// ---------------------------------------------------------------------------
// doctor: appointments (own only)
// ---------------------------------------------------------------------------

export const doctorAppointments: Handler = () => {
  const { doctorId } = clinicScope("appointments.manage");
  const rows = tables.appointments.filter((a) => a.doctorId === doctorId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { appointments: rows.map((a) => ({ ...a, doctorName: doctorName(a.doctorId), consent: hasConsent(a.patientUid, doctorId) })) };
};

export const updateAppointment: Handler = ({ params, body }) => {
  const { user, doctorId } = clinicScope("appointments.manage");
  const p = appointmentUpdateSchema.parse(body);
  const a = tables.appointments.find((x) => x.id === params.id && x.doctorId === doctorId);
  if (!a) throw new HttpError(404, "Appointment not found");
  if (a.status === "CANCELLED") throw new HttpError(409, "The patient cancelled this appointment");
  a.status = p.status;
  if (p.scheduledAt !== undefined) a.scheduledAt = p.scheduledAt ? new Date(p.scheduledAt).toISOString() : null;
  if (p.doctorNote !== undefined) a.doctorNote = p.doctorNote;
  a.updatedAt = now();
  touch("appointments");
  audit(user, "UPDATE", "APPOINTMENT", a.id, `${a.patientUid}: ${p.status}`);
  return { appointment: { ...a, doctorName: doctorName(a.doctorId) } };
};

// ---------------------------------------------------------------------------
// doctor: registration form / medical questionnaire + patient answers
// ---------------------------------------------------------------------------

const myQuestionnaire = (doctorId: string) => tables.questionnaires.find((q) => q.doctorId === doctorId);
const qDTO = (q: QuestionnaireRow) => ({ id: q.id, doctorId: q.doctorId, doctorName: doctorName(q.doctorId), title: q.title, description: q.description, active: q.active, fields: j(q.fields, []), updatedAt: q.updatedAt });

export const getQuestionnaire: Handler = () => {
  const { doctorId } = clinicScope();
  const q = myQuestionnaire(doctorId);
  return { questionnaire: q ? qDTO(q) : null };
};

export const saveQuestionnaire: Handler = ({ body }) => {
  const { user, doctorId } = clinicScope();
  if (user.role !== "DOCTOR") throw new HttpError(403, "Only the doctor can edit the patient form");
  const p = questionnaireSchema.parse(body);
  const t = now();
  let q = myQuestionnaire(doctorId);
  if (!q) {
    q = { id: newId(), doctorId, title: p.title, description: p.description, fields: "[]", active: p.active, createdAt: t, updatedAt: t };
    tables.questionnaires.push(q);
  }
  q.title = p.title;
  q.description = p.description;
  q.active = p.active;
  q.fields = JSON.stringify(p.fields);
  q.updatedAt = t;
  touch("questionnaires");
  audit(user, "UPDATE", "QUESTIONNAIRE", q.id, `${p.fields.length} fields`);
  return { questionnaire: qDTO(q) };
};

/** Forms of the doctors this patient has a relationship with (consent or a live appointment). */
export const myForms: Handler = () => {
  const user = requireRole("PATIENT");
  const uid = user.patientUid!;
  const doctorIds = new Set<string>([
    ...tables.accessGrants.filter((a) => a.patientUid === uid && a.status === "GRANTED").map((a) => a.doctorId),
    ...tables.appointments.filter((a) => a.patientUid === uid && a.status !== "DECLINED" && a.status !== "CANCELLED").map((a) => a.doctorId),
  ]);
  const forms = tables.questionnaires.filter((q) => q.active && doctorIds.has(q.doctorId));
  return {
    forms: forms.map((q) => {
      const r = tables.questionnaireResponses.find((x) => x.questionnaireId === q.id && x.patientUid === uid);
      return { ...qDTO(q), response: r ? { answers: j(r.answers, {}), fieldUpdated: j(r.fieldUpdated, {}), updatedAt: r.updatedAt } : null };
    }),
  };
};

export const submitForm: Handler = ({ params, body }) => {
  const user = requireRole("PATIENT");
  const uid = user.patientUid!;
  const { answers } = answersSchema.parse(body);
  const q = tables.questionnaires.find((x) => x.id === params.id && x.active);
  const related =
    q &&
    (tables.accessGrants.some((a) => a.patientUid === uid && a.doctorId === q.doctorId && a.status === "GRANTED") ||
      tables.appointments.some((a) => a.patientUid === uid && a.doctorId === q.doctorId && a.status !== "DECLINED" && a.status !== "CANCELLED"));
  if (!q || !related) throw new HttpError(404, "Form not found");
  const fields = j<{ id: string; label: string; required: boolean }[]>(q.fields, []);
  for (const f of fields) if (f.required && !(answers[f.id] ?? "").trim()) throw new HttpError(400, `"${f.label}" is required`);
  const t = now();
  let r = tables.questionnaireResponses.find((x) => x.questionnaireId === q.id && x.patientUid === uid);
  if (!r) {
    r = { id: newId(), questionnaireId: q.id, doctorId: q.doctorId, patientUid: uid, answers: "{}", fieldUpdated: "{}", createdAt: t, updatedAt: t };
    tables.questionnaireResponses.push(r);
  }
  const old = j<Record<string, string>>(r.answers, {});
  const stamps = j<Record<string, string>>(r.fieldUpdated, {});
  const next: Record<string, string> = {};
  for (const f of fields) {
    next[f.id] = answers[f.id] ?? "";
    if (old[f.id] !== next[f.id]) stamps[f.id] = t;
  }
  r.answers = JSON.stringify(next);
  r.fieldUpdated = JSON.stringify(stamps);
  r.updatedAt = t;
  touch("questionnaireResponses");
  audit(user, "UPDATE", "QUESTIONNAIRE", q.id, `response by ${uid}`);
  return { ok: true };
};

// ---------------------------------------------------------------------------
// doctor: find patient accounts, request access, view (consented), start a consultation
// ---------------------------------------------------------------------------

function accessState(uid: string, doctorId: string): "NONE" | "REQUESTED" | "GRANTED" | "DENIED" | "REVOKED" {
  if (consentOf(uid, doctorId)) return "GRANTED";
  const rows = tables.accessGrants.filter((a) => a.patientUid === uid && a.doctorId === doctorId).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return rows[0]?.status ?? "NONE";
}

export const searchPatientAccounts: Handler = ({ query }) => {
  const { user, doctorId } = clinicScope("patientAccounts.search");
  const q = (query.get("q") ?? "").trim();
  const by = query.get("by") ?? "uid";
  if (!["uid", "name", "mobile", "email"].includes(by)) throw new HttpError(400, "by must be uid, name, mobile or email");
  // no browsing / enumeration of all patients: a meaningful query is required
  if (q.length < (by === "name" ? 3 : 5)) throw new HttpError(400, `q: enter at least ${by === "name" ? 3 : 5} characters`);
  const needle = q.toLowerCase();
  let hits = tables.patientProfiles.filter((p) => {
    if (by === "uid") return p.patientUid.toLowerCase() === needle || p.patientUid.toLowerCase().includes(needle);
    if (by === "name") return p.fullName.toLowerCase().includes(needle);
    if (by === "mobile") return p.mobile.replace(/\D/g, "").endsWith(needle.replace(/\D/g, "")) && needle.replace(/\D/g, "").length >= 5;
    return p.email.toLowerCase() === needle; // e-mail must match exactly
  });
  hits = hits.slice(0, 20);
  audit(user, "PATIENT_SEARCH", "PATIENT_ACCOUNT", "", `by=${by} q="${q.slice(0, 40)}" results=${hits.length} doctor=${doctorId}`);
  return {
    results: hits.map((p) => ({
      patientUid: p.patientUid,
      fullName: p.fullName,
      gender: p.gender,
      ageYears: p.ageYears,
      mobile: maskMobile(p.mobile),
      email: maskEmail(p.email),
      access: accessState(p.patientUid, doctorId),
    })),
  };
};

export const requestPatientAccess: Handler = ({ params }) => {
  const { user, doctorId } = clinicScope("patientAccounts.search");
  const prof = tables.patientProfiles.find((p) => p.patientUid === params.uid);
  if (!prof) throw new HttpError(404, "Patient account not found");
  const state = accessState(prof.patientUid, doctorId);
  if (state === "GRANTED") return { status: "GRANTED" };
  if (state === "REQUESTED") return { status: "REQUESTED" };
  const t = now();
  tables.accessGrants.push({ id: newId(), patientUid: prof.patientUid, doctorId, status: "REQUESTED", source: "DOCTOR_REQUEST", requestedAt: t, respondedAt: null, revokedAt: null, expiresAt: null, note: "", updatedAt: t });
  touch("accessGrants");
  audit(user, "ACCESS_REQUEST", "PATIENT_ACCOUNT", prof.patientUid, `doctor ${doctorId}`);
  return { status: "REQUESTED" };
};

export const viewPatientAccount: Handler = ({ params }) => {
  const { user, doctorId } = clinicScope("patientAccounts.search");
  const prof = tables.patientProfiles.find((p) => p.patientUid === params.uid);
  if (!prof) throw new HttpError(404, "Patient account not found");
  const access = accessState(prof.patientUid, doctorId);
  const consent = consentOf(prof.patientUid, doctorId);
  const dto = toProfileDTO(prof);
  const mayMedical = !!consent && can(user, "patientAccounts.medical");

  const basic = { patientUid: dto.patientUid, fullName: dto.fullName, gender: dto.gender, ageYears: dto.ageYears, mobile: maskMobile(dto.mobile), email: maskEmail(dto.email) };
  audit(user, mayMedical ? "PATIENT_MEDICAL_VIEW" : "PATIENT_PROFILE_VIEW", "PATIENT_ACCOUNT", prof.patientUid, `doctor ${doctorId} consent=${consent?.id ?? "none"}`);
  if (!mayMedical) return { access, basic, medical: null, forms: [], files: [] };

  const q = myQuestionnaire(doctorId);
  const resp = q && tables.questionnaireResponses.find((r) => r.questionnaireId === q.id && r.patientUid === prof.patientUid);
  const files = tables.files.filter((f) => !f.deleted && f.relatedType === "PATIENT_ACCOUNT" && f.relatedId === prof.patientUid);
  return {
    access,
    basic,
    medical: dto, // full, unmasked profile — consent given
    forms: q && resp ? [{ ...qDTO(q), response: { answers: j(resp.answers, {}), fieldUpdated: j(resp.fieldUpdated, {}), updatedAt: resp.updatedAt } }] : [],
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt })),
  };
};

/** Doctor starts a consultation from a patient UID: needs consent; creates/links the doctor's own patient record. */
export const startConsultation: Handler = ({ params }) => {
  const { user, doctorId } = clinicScope("patientAccounts.medical");
  if (!can(user, "consultation.dataentry")) throw new HttpError(403, "Insufficient permissions");
  const prof = tables.patientProfiles.find((p) => p.patientUid === params.uid);
  if (!prof) throw new HttpError(404, "Patient account not found");
  const consent = consentOf(prof.patientUid, doctorId);
  if (!consent) throw new HttpError(403, "The patient has not given consent to access their medical information");

  let rec = tables.patients.find((p) => p.doctorId === doctorId && p.patientUid === prof.patientUid);
  let created = false;
  if (!rec) {
    const t = now();
    rec = {
      id: newId(), code: generatePatientCode(), name: prof.fullName, ageYears: prof.ageYears, ageMonths: null, dob: prof.dob,
      gender: prof.gender, mobile: prof.mobile, address: prof.address, weight: prof.weight, height: prof.height, bloodGroup: prof.bloodGroup,
      allergies: prof.allergies, medicalHistory: [prof.conditions, prof.history].filter(Boolean).join("\n"), createdById: user.id,
      createdAt: t, updatedAt: t, doctorId, patientUid: prof.patientUid,
    };
    tables.patients.push(rec);
    touch("patients");
    created = true;
  }
  audit(user, "START_CONSULTATION", "PATIENT_ACCOUNT", prof.patientUid, `doctor ${doctorId}, record ${rec.id}${created ? " (created)" : ""}`);
  // The UI shows these values (with their last-updated dates) so the doctor can VERIFY them against the stored record
  return { patient: toPatientDTO(rec, true), profile: toProfileDTO(prof), created };
};
