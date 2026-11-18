// Typed API client — every backend endpoint in one place.

import { handleRequest } from "@/lib/local-backend/router";
import { isRemote, remoteRequest } from "@/lib/remote-client";
import { shrinkDataUrl } from "@/lib/image";
import type { FileDTO } from "@/lib/local-backend/files";
import type { AssistantDTO } from "@/lib/local-backend/accounts";
import type { ProfileDTO as PatientProfile } from "@/lib/local-backend/portal";
import type { AccountStatus } from "@/lib/types";
import type { AccessDTO, AppointmentDTO, DirectoryDoctor, PatientAccountSummary, PatientAccountView, PatientFormDTO, QuestionField, QuestionnaireDTO } from "@/lib/portal-types";
import type {
  ChamberDTO,
  DashboardStats,
  DoctorProfileDTO,
  LibraryItemDTO,
  MedicineRecord,
  PatientDTO,
  PrescriptionDTO,
  SessionUser,
  TemplateConfig,
  UserDTO,
} from "@/lib/types";

// All calls are served by the in-browser backend (IndexedDB) — GitHub Pages can
// only host static files. Signatures and error messages match the original HTTP API.
function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Google build (NEXT_PUBLIC_API_URL set): Google Sheets + Drive via the Apps Script backend.
  // Otherwise: the in-browser demo backend.
  return isRemote ? remoteRequest<T>(url, init) : handleRequest<T>(url, init);
}

export type { FileDTO, AssistantDTO, PatientProfile };

// ---------- Auth ----------
export const api = {
  /** `identifier` = username or e-mail */
  login: (identifier: string, password: string) =>
    request<{ user: SessionUser; token?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),
  /** Patients: Google Sign-In (ID token from Google Identity Services) — registers on first use */
  googleLogin: (idToken: string) =>
    request<{ user: SessionUser; token?: string; isNew: boolean }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: SessionUser | null }>("/api/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; token?: string; user: SessionUser }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // ---------- Dashboard ----------
  dashboard: () => request<{ stats: DashboardStats }>("/api/dashboard"),

  // ---------- Doctor profile ----------
  getDoctorProfile: () => request<{ profile: DoctorProfileDTO }>("/api/doctor/profile"),
  updateDoctorProfile: async (data: Partial<DoctorProfileDTO>) => {
    const body = { ...data };
    if (isRemote) {
      // Google build: images go to Drive — shrink large ones first
      for (const k of ["photoUrl", "signatureUrl", "logoUrl"] as const) {
        const v = body[k];
        if (typeof v === "string" && v) body[k] = await shrinkDataUrl(v);
      }
    }
    return request<{ profile: DoctorProfileDTO }>("/api/doctor/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  // ---------- Templates ----------
  getTemplates: () =>
    request<{ templates: { id: string; name: string; templateKey: string; config: TemplateConfig; isDefault: boolean }[] }>(
      "/api/templates"
    ),
  saveTemplate: (data: { id?: string; name: string; templateKey: string; config: TemplateConfig; isDefault?: boolean }) =>
    request<{ ok: boolean }>("/api/templates", { method: "POST", body: JSON.stringify(data) }),
  deleteTemplate: (id: string) =>
    request<{ ok: boolean }>(`/api/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ---------- Patients ----------
  listPatients: (q = "", page = 1, limit = 20) =>
    request<{ items: PatientDTO[]; total: number }>(
      `/api/patients?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`
    ),
  getPatient: (id: string) => request<{ patient: PatientDTO }>(`/api/patients/${id}`),
  createPatient: (data: Partial<PatientDTO>) =>
    request<{ patient: PatientDTO }>("/api/patients", { method: "POST", body: JSON.stringify(data) }),
  updatePatient: (id: string, data: Partial<PatientDTO>) =>
    request<{ patient: PatientDTO }>(`/api/patients/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  patientConsultations: (id: string) =>
    request<{ prescriptions: PrescriptionDTO[] }>(`/api/patients/${id}/consultations`),

  // ---------- Prescriptions ----------
  listPrescriptions: (params: { q?: string; patientId?: string; status?: string; page?: number; limit?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.patientId) sp.set("patientId", params.patientId);
    if (params.status) sp.set("status", params.status);
    sp.set("page", String(params.page ?? 1));
    sp.set("limit", String(params.limit ?? 20));
    return request<{ items: PrescriptionDTO[]; total: number }>(`/api/prescriptions?${sp.toString()}`);
  },
  getPrescription: (id: string) => request<{ prescription: PrescriptionDTO }>(`/api/prescriptions/${id}`),
  createPrescription: (data: unknown) =>
    request<{ prescription: PrescriptionDTO }>("/api/prescriptions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePrescription: (id: string, data: unknown) =>
    request<{ prescription: PrescriptionDTO }>(`/api/prescriptions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deletePrescription: (id: string) =>
    request<{ ok: boolean }>(`/api/prescriptions/${id}`, { method: "DELETE" }),
  finalizePrescription: (id: string) =>
    request<{ prescription: PrescriptionDTO }>(`/api/prescriptions/${id}/finalize`, { method: "POST" }),
  revisePrescription: (id: string, revisionNote: string) =>
    request<{ prescription: PrescriptionDTO }>(`/api/prescriptions/${id}/revise`, {
      method: "POST",
      body: JSON.stringify({ revisionNote }),
    }),
  duplicatePrescription: (id: string) =>
    request<{ prescription: PrescriptionDTO }>(`/api/prescriptions/${id}/duplicate`, { method: "POST" }),

  // ---------- Medicines ----------
  searchMedicines: (q: string, opts: { form?: string; limit?: number } = {}) => {
    const sp = new URLSearchParams({ q });
    if (opts.form) sp.set("form", opts.form);
    sp.set("limit", String(opts.limit ?? 40));
    return request<{ items: MedicineRecord[]; total: number }>(`/api/medicines/search?${sp.toString()}`);
  },
  dosageForms: () => request<{ forms: string[] }>("/api/medicines/forms"),

  // ---------- Libraries ----------
  listLibrary: (category: string, q = "", subcategory = "") => {
    const sp = new URLSearchParams({ category });
    if (q) sp.set("q", q);
    if (subcategory && subcategory !== "ALL") sp.set("subcategory", subcategory);
    return request<{ items: LibraryItemDTO[]; subcategories: string[] }>(
      `/api/libraries?${sp.toString()}`
    );
  },
  addLibraryItem: (data: { category: string; labelEn: string; labelBn?: string; code?: string; subcategory?: string }) =>
    request<{ item: LibraryItemDTO }>("/api/libraries", { method: "POST", body: JSON.stringify(data) }),

  // ---------- Chambers ----------
  listChambers: () => request<{ chambers: ChamberDTO[] }>("/api/doctor/chambers"),
  createChamber: (data: Partial<ChamberDTO>) =>
    request<{ chamber: ChamberDTO }>("/api/doctor/chambers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateChamber: (id: string, data: Partial<ChamberDTO>) =>
    request<{ chamber: ChamberDTO }>(`/api/doctor/chambers/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteChamber: (id: string) =>
    request<{ ok: boolean }>(`/api/doctor/chambers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // ---------- Admin ----------
  listUsers: () => request<{ users: UserDTO[] }>("/api/admin/users"),
  createUser: (data: {
    role?: "DOCTOR" | "SUPER_ADMIN";
    name: string;
    username: string;
    tempPassword: string;
    email?: string;
    phone?: string;
    status?: AccountStatus;
  }) => request<{ user: UserDTO; tempPasswordExpiresAt: string | null }>("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (
    id: string,
    data: { name?: string; email?: string; phone?: string; status?: AccountStatus; tempPassword?: string }
  ) => request<{ user: UserDTO }>(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // ---------- Doctor → assistants ----------
  listAssistants: () => request<{ assistants: AssistantDTO[] }>("/api/doctor/assistants"),
  createAssistant: (data: {
    name: string;
    username: string;
    tempPassword: string;
    email?: string;
    phone?: string;
    status?: AccountStatus;
    permissions?: string[];
  }) => request<{ assistant: AssistantDTO; tempPasswordExpiresAt: string | null }>("/api/doctor/assistants", { method: "POST", body: JSON.stringify(data) }),
  updateAssistant: (
    id: string,
    data: { name?: string; email?: string; phone?: string; status?: AccountStatus; permissions?: string[]; tempPassword?: string }
  ) => request<{ assistant: AssistantDTO }>(`/api/doctor/assistants/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  removeAssistant: (id: string) => request<{ ok: boolean }>(`/api/doctor/assistants/${id}`, { method: "DELETE" }),

  // ---------- Doctor → patient accounts, appointments, patient form ----------
  searchPatientAccounts: (q: string, by: "uid" | "name" | "mobile" | "email") =>
    request<{ results: PatientAccountSummary[] }>(`/api/patient-accounts/search?by=${by}&q=${encodeURIComponent(q)}`),
  viewPatientAccount: (uid: string) => request<PatientAccountView>(`/api/patient-accounts/${encodeURIComponent(uid)}`),
  requestPatientAccess: (uid: string) =>
    request<{ status: string }>(`/api/patient-accounts/${encodeURIComponent(uid)}/request-access`, { method: "POST", body: "{}" }),
  startConsultation: (uid: string) =>
    request<{ patient: PatientDTO; profile: PatientProfile; created: boolean }>(
      `/api/patient-accounts/${encodeURIComponent(uid)}/start-consultation`,
      { method: "POST", body: "{}" }
    ),
  doctorAppointments: () => request<{ appointments: AppointmentDTO[] }>("/api/appointments"),
  updateAppointment: (id: string, data: { status: "CONFIRMED" | "DECLINED" | "COMPLETED"; scheduledAt?: string | null; doctorNote?: string }) =>
    request<{ appointment: AppointmentDTO }>(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  getQuestionnaire: () => request<{ questionnaire: QuestionnaireDTO | null }>("/api/doctor/questionnaire"),
  saveQuestionnaire: (data: { title: string; description: string; active: boolean; fields: QuestionField[] }) =>
    request<{ questionnaire: QuestionnaireDTO }>("/api/doctor/questionnaire", { method: "PUT", body: JSON.stringify(data) }),

  // ---------- Patient portal ----------
  doctorDirectory: () => request<{ doctors: DirectoryDoctor[] }>("/api/doctors/directory"),
  myProfile: () => request<{ profile: PatientProfile }>("/api/me/profile"),
  updateMyProfile: (data: Record<string, unknown>) =>
    request<{ profile: PatientProfile }>("/api/me/profile", { method: "PUT", body: JSON.stringify(data) }),
  myPrescriptions: () => request<{ prescriptions: (PrescriptionDTO & { pdfFileId: string | null })[] }>("/api/me/prescriptions"),
  myAccess: () => request<{ access: AccessDTO[] }>("/api/me/access"),
  grantAccess: (doctorId: string) => request<{ access: AccessDTO }>("/api/me/access/grant", { method: "POST", body: JSON.stringify({ doctorId }) }),
  respondAccess: (id: string, action: "grant" | "deny") =>
    request<{ access: AccessDTO }>(`/api/me/access/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) }),
  revokeAccess: (id: string) => request<{ access: AccessDTO }>(`/api/me/access/${id}/revoke`, { method: "POST", body: "{}" }),
  myAppointments: () => request<{ appointments: AppointmentDTO[] }>("/api/me/appointments"),
  requestAppointment: (data: { doctorId: string; chamberId?: string | null; preferredDate: string; preferredTime?: string; reason?: string; shareMedical: boolean }) =>
    request<{ appointment: AppointmentDTO }>("/api/me/appointments", { method: "POST", body: JSON.stringify(data) }),
  cancelAppointment: (id: string) => request<{ appointment: AppointmentDTO }>(`/api/me/appointments/${id}/cancel`, { method: "POST", body: "{}" }),
  myForms: () => request<{ forms: PatientFormDTO[] }>("/api/me/forms"),
  submitForm: (id: string, answers: Record<string, string>) =>
    request<{ ok: boolean }>(`/api/me/forms/${id}`, { method: "PUT", body: JSON.stringify({ answers }) }),
  auditLogs: (limit = 100) =>
    request<{ logs: { id: string; userEmail: string; userRole: string; action: string; entity: string; entityId: string; details: string; createdAt: string }[] }>(
      `/api/admin/audit-logs?limit=${limit}`
    ),
  medicineStats: () =>
    request<{ total: number; allopathic: number; herbal: number; forms: number; manufacturers: number }>(
      "/api/admin/medicines"
    ),
  importMedicines: () =>
    request<{ imported: number; skipped: number; errors: string[] }>("/api/admin/medicines/import", {
      method: "POST",
    }),

  // ---------- Files (Google Drive in the Google build) ----------
  uploadFile: (data: {
    kind: string;
    relatedType: "PATIENT" | "PRESCRIPTION" | "PATIENT_ACCOUNT";
    relatedId: string;
    name: string;
    mimeType: string;
    dataBase64: string;
  }) => request<{ file: FileDTO }>("/api/files", { method: "POST", body: JSON.stringify(data) }),
  listFiles: (relatedType: "PATIENT" | "PRESCRIPTION" | "PATIENT_ACCOUNT", relatedId: string, kind?: string) =>
    request<{ files: FileDTO[] }>(
      `/api/files?relatedType=${relatedType}&relatedId=${encodeURIComponent(relatedId)}${kind ? `&kind=${kind}` : ""}`
    ),
  fileContent: (id: string) =>
    request<{ file: FileDTO; dataBase64: string }>(`/api/files/${encodeURIComponent(id)}/content`),
  deleteFile: (id: string) =>
    request<{ ok: boolean }>(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ---------- Admin: backups & exports ----------
  systemFiles: () => request<{ files: FileDTO[] }>("/api/admin/files"),
  runBackup: () => request<{ file: FileDTO }>("/api/admin/backups", { method: "POST", body: "{}" }),
  createExport: (entity: "patients" | "prescriptions" | "audit-logs" | "users") =>
    request<{ file: FileDTO }>("/api/admin/exports", { method: "POST", body: JSON.stringify({ entity }) }),
};

// ---------- helpers for files in the browser ----------

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error ?? new Error("Could not read the file"));
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Open (inline) or download a stored file. */
export async function openStoredFile(id: string, mode: "view" | "download") {
  const { file, dataBase64 } = await api.fileContent(id);
  const url = URL.createObjectURL(base64ToBlob(dataBase64, file.mimeType));
  if (mode === "view") {
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
