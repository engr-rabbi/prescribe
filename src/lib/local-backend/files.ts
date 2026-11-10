// File registry + handlers. The *registry* (names, MIME types, owners, related
// record, storage key) is an ordinary table — in the Google build the `Files`
// sheet. The *bytes* never go in a table: they live behind runtime.files
// (Google Drive in production, IndexedDB in the local demo build).

import { HttpError } from "./errors";
import { newId } from "./crypto";
import { runtime } from "./runtime";
import { tables, touch, type FileRow } from "./store";
import type { SessionUser } from "@/lib/types";
import { audit, inScope, requireRole, requireUser } from "./core";
import type { Handler } from "./handlers";

export const FILE_KINDS = [
  "PATIENT_PHOTO",
  "PRESCRIPTION_PDF",
  "MEDICAL_REPORT",
  "LAB_REPORT",
  "XRAY",
  "CT_SCAN",
  "MRI",
  "ULTRASOUND",
  "OTHER_DOCUMENT",
  "ATTACHMENT",
  "DOCTOR_PHOTO",
  "DOCTOR_SIGNATURE",
  "CLINIC_LOGO",
  "EXPORT",
  "BACKUP",
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** kinds a user may upload through the generic upload endpoint */
const UPLOADABLE: FileKind[] = [
  "PATIENT_PHOTO",
  "PRESCRIPTION_PDF",
  "MEDICAL_REPORT",
  "LAB_REPORT",
  "XRAY",
  "CT_SCAN",
  "MRI",
  "ULTRASOUND",
  "OTHER_DOCUMENT",
  "ATTACHMENT",
];

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(json|vnd\.openxmlformats-officedocument\.[a-z.]+|msword|vnd\.ms-excel)|application\/dicom)$/i;

/** Drive folder layout (see docs). First segment = top-level folder under "Smart Prescription System". */
export const TOP_FOLDERS = [
  "Doctor Profiles",
  "Patient Documents",
  "Patient Medical Reports",
  "Prescription PDFs",
  "Investigation Reports",
  "Medical Images",
  "Clinic Logos",
  "Doctor Signatures",
  "System Backups",
  "Exported Reports",
] as const;

const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "unnamed";

export function patientFolderName(p: { code: string; name: string }) {
  return clean(`${p.code} - ${p.name}`);
}

export function doctorFolderName(d: { id: string; fullName: string }) {
  return clean(`${d.fullName} (${d.id.slice(0, 8)})`);
}

/** Folder path (relative to the system root) for a file. */
export function folderPathFor(kind: FileKind, relatedType: string, relatedId: string): string {
  const patient = relatedType === "PATIENT" ? tables.patients.find((p) => p.id === relatedId) : undefined;
  const rx = relatedType === "PRESCRIPTION" ? tables.prescriptions.find((r) => r.id === relatedId) : undefined;
  const rxPatient = rx ? tables.patients.find((p) => p.id === rx.patientId) : undefined;
  const pat = patient ?? rxPatient;
  const doctor =
    relatedType === "DOCTOR"
      ? tables.doctors.find((d) => d.id === relatedId)
      : rx
        ? tables.doctors.find((d) => d.id === rx.doctorId)
        : undefined;
  const pName = pat ? patientFolderName(pat) : "Unassigned";
  const dName = doctor ? doctorFolderName(doctor) : "Unassigned";

  switch (kind) {
    case "DOCTOR_PHOTO":
      return `Doctor Profiles/${dName}`;
    case "DOCTOR_SIGNATURE":
      return `Doctor Signatures/${dName}`;
    case "CLINIC_LOGO":
      return `Clinic Logos/${dName}`;
    case "PRESCRIPTION_PDF":
      return `Prescription PDFs/${dName}/${pName}`;
    case "MEDICAL_REPORT":
      return `Patient Medical Reports/${pName}`;
    case "LAB_REPORT":
      return `Investigation Reports/${pName}`;
    case "XRAY":
      return `Medical Images/${pName}/X-ray`;
    case "CT_SCAN":
      return `Medical Images/${pName}/CT`;
    case "MRI":
      return `Medical Images/${pName}/MRI`;
    case "ULTRASOUND":
      return `Medical Images/${pName}/Ultrasound`;
    case "EXPORT":
      return "Exported Reports";
    case "BACKUP":
      return "System Backups";
    case "PATIENT_PHOTO":
    case "OTHER_DOCUMENT":
    case "ATTACHMENT":
    default:
      return `Patient Documents/${pName}`;
  }
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function storedFileName(kind: FileKind, original: string, relatedCode = ""): string {
  const base = clean(original);
  if (kind === "PRESCRIPTION_PDF") return base; // already RX-…_v1.pdf
  return clean(`${stamp()}_${kind}${relatedCode ? `_${relatedCode}` : ""}_${base}`);
}

export function approxBytes(base64: string): number {
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - pad;
}

/** Save bytes + registry row. Used by the upload endpoint, PDFs, exports, backups, doctor images. */
export function saveFile(input: {
  kind: FileKind;
  relatedType: string;
  relatedId: string;
  name: string;
  mimeType: string;
  dataBase64: string;
  user: { id: string; email: string } | null;
  relatedCode?: string;
}): FileRow {
  const size = approxBytes(input.dataBase64);
  if (size > MAX_FILE_BYTES) throw new HttpError(413, "File is too large (max 8 MB)");
  if (!ALLOWED_MIME.test(input.mimeType)) throw new HttpError(415, `File type not allowed: ${input.mimeType}`);
  const meta: Omit<FileRow, "storageKey"> = {
    id: newId(),
    name: storedFileName(input.kind, input.name, input.relatedCode),
    mimeType: input.mimeType,
    size,
    kind: input.kind,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    folderPath: folderPathFor(input.kind, input.relatedType, input.relatedId),
    ownerUserId: input.user?.id ?? "",
    ownerEmail: input.user?.email ?? "",
    createdAt: new Date().toISOString(),
    deleted: false,
  };
  const storageKey = runtime.files.write(meta, input.dataBase64);
  const row: FileRow = { ...meta, storageKey };
  tables.files.push(row);
  touch("files");
  return row;
}

export function trashFile(row: FileRow) {
  try {
    runtime.files.remove(row);
  } catch (e) {
    console.error("[files] could not remove stored bytes", e);
  }
  row.deleted = true;
  touch("files");
}

export interface FileDTO {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: string;
  relatedType: string;
  relatedId: string;
  ownerEmail: string;
  createdAt: string;
  /** Drive file id (Google build) — informational only */
  driveFileId: string;
}

export const toFileDTO = (f: FileRow): FileDTO => ({
  id: f.id,
  name: f.name,
  mimeType: f.mimeType,
  size: f.size,
  kind: f.kind,
  relatedType: f.relatedType,
  relatedId: f.relatedId,
  ownerEmail: f.ownerEmail,
  createdAt: f.createdAt,
  driveFileId: runtime.label === "google" ? f.storageKey : "",
});

// ---------------------------------------------------------------------------
// access control
// ---------------------------------------------------------------------------

function canAccess(user: SessionUser, f: FileRow): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  switch (f.relatedType) {
    case "PATIENT":
      return true; // doctors & assistants share the patient register
    case "PRESCRIPTION": {
      const rx = tables.prescriptions.find((r) => r.id === f.relatedId);
      return !!rx && inScope(user, rx);
    }
    case "DOCTOR":
      return user.role === "DOCTOR" && user.doctorId === f.relatedId;
    default:
      return false; // EXPORT / BACKUP / SYSTEM → super admin only
  }
}

function getFile(id: string): FileRow {
  const f = tables.files.find((x) => x.id === id && !x.deleted);
  if (!f) throw new HttpError(404, "File not found");
  return f;
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

export const uploadFile: Handler = ({ body }) => {
  const user = requireRole("DOCTOR", "ASSISTANT", "SUPER_ADMIN");
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = String(b.kind ?? "") as FileKind;
  const relatedType = String(b.relatedType ?? "");
  const relatedId = String(b.relatedId ?? "");
  const name = String(b.name ?? "").trim();
  const mimeType = String(b.mimeType ?? "");
  const dataBase64 = String(b.dataBase64 ?? "").replace(/^data:[^,]*,/, "");
  if (!UPLOADABLE.includes(kind)) throw new HttpError(400, "kind: unsupported file category");
  if (!name) throw new HttpError(400, "name: file name is required");
  if (!dataBase64) throw new HttpError(400, "dataBase64: file content is required");
  if (relatedType !== "PATIENT" && relatedType !== "PRESCRIPTION") {
    throw new HttpError(400, "relatedType must be PATIENT or PRESCRIPTION");
  }

  let relatedCode = "";
  if (relatedType === "PATIENT") {
    const p = tables.patients.find((x) => x.id === relatedId);
    if (!p) throw new HttpError(404, "Patient not found");
    relatedCode = p.code;
  } else {
    const rx = tables.prescriptions.find((x) => x.id === relatedId);
    if (!rx) throw new HttpError(404, "Prescription not found");
    if (!inScope(user, rx)) throw new HttpError(403, "Insufficient permissions");
    relatedCode = rx.code;
  }
  if (kind === "PRESCRIPTION_PDF" && relatedType !== "PRESCRIPTION") {
    throw new HttpError(400, "Prescription PDFs must be attached to a prescription");
  }
  if (kind === "PRESCRIPTION_PDF" && user.role === "ASSISTANT") {
    throw new HttpError(403, "Insufficient permissions");
  }

  const row = saveFile({ kind, relatedType, relatedId, name, mimeType, dataBase64, user, relatedCode });
  audit(user, "UPLOAD", "FILE", row.id, `${row.kind}: ${row.folderPath}/${row.name}`);
  return { file: toFileDTO(row) };
};

export const listFiles: Handler = ({ query }) => {
  const user = requireUser();
  const relatedType = query.get("relatedType") ?? "";
  const relatedId = query.get("relatedId") ?? "";
  const kind = query.get("kind") ?? "";
  if (!relatedType || !relatedId) throw new HttpError(400, "relatedType and relatedId are required");
  const items = tables.files
    .filter((f) => !f.deleted && f.relatedType === relatedType && f.relatedId === relatedId)
    .filter((f) => !kind || f.kind === kind)
    .filter((f) => canAccess(user, f))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { files: items.map(toFileDTO) };
};

export const fileContent: Handler = ({ params }) => {
  const user = requireUser();
  const f = getFile(params.id);
  if (!canAccess(user, f)) throw new HttpError(403, "Insufficient permissions");
  const dataBase64 = runtime.files.read(f);
  audit(user, "DOWNLOAD", "FILE", f.id, f.name);
  return { file: toFileDTO(f), dataBase64 };
};

export const deleteFile: Handler = ({ params }) => {
  const user = requireRole("DOCTOR", "SUPER_ADMIN");
  const f = getFile(params.id);
  if (!canAccess(user, f)) throw new HttpError(403, "Insufficient permissions");
  if (f.kind === "BACKUP") throw new HttpError(400, "Backups are removed by the retention policy");
  trashFile(f);
  audit(user, "DELETE", "FILE", f.id, f.name);
  return { ok: true };
};

// ---------------------------------------------------------------------------
// admin: backups & exports
// ---------------------------------------------------------------------------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function toCSV(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

function utf8Base64(text: string): string {
  // works in browsers, Node and Apps Script (via the platform-provided encoder)
  return runtime.encodeBase64(text);
}

export const EXPORT_ENTITIES = ["patients", "prescriptions", "audit-logs", "users"] as const;

export const createExport: Handler = ({ body }) => {
  const admin = requireRole("SUPER_ADMIN");
  const entity = String((body as Record<string, unknown> | null)?.entity ?? "");
  if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) {
    throw new HttpError(400, `entity must be one of: ${EXPORT_ENTITIES.join(" | ")}`);
  }
  let csv = "";
  if (entity === "patients") {
    csv = toCSV(
      ["code", "name", "ageYears", "gender", "mobile", "address", "bloodGroup", "allergies", "createdAt"],
      tables.patients.map((p) => [p.code, p.name, p.ageYears, p.gender, p.mobile, p.address, p.bloodGroup, p.allergies, p.createdAt])
    );
  } else if (entity === "prescriptions") {
    csv = toCSV(
      ["code", "status", "version", "date", "patientCode", "patientName", "doctor", "medicines", "followUpDate"],
      tables.prescriptions.map((r) => {
        const p = tables.patients.find((x) => x.id === r.patientId);
        const d = tables.doctors.find((x) => x.id === r.doctorId);
        const meds = tables.prescriptionMedicines
          .filter((m) => m.prescriptionId === r.id)
          .map((m) => `${m.brandName} ${m.strength}`.trim())
          .join("; ");
        return [r.code, r.status, r.version, r.prescriptionDate, p?.code, p?.name, d?.fullName, meds, r.followUpDate];
      })
    );
  } else if (entity === "users") {
    csv = toCSV(
      ["email", "name", "role", "active", "createdAt"],
      tables.users.map((u) => [u.email, u.name, u.role, u.active, u.createdAt])
    );
  } else {
    const logs = runtime.readAudit(5000);
    csv = toCSV(
      ["createdAt", "userEmail", "userRole", "action", "entity", "entityId", "details"],
      logs.map((l) => [l.createdAt, l.userEmail, l.userRole, l.action, l.entity, l.entityId, l.details])
    );
  }
  const row = saveFile({
    kind: "EXPORT",
    relatedType: "SYSTEM",
    relatedId: "",
    name: `${entity}.csv`,
    mimeType: "text/csv",
    dataBase64: utf8Base64("\uFEFF" + csv),
    user: admin,
  });
  audit(admin, "EXPORT", "FILE", row.id, `${entity} (${row.name})`);
  return { file: toFileDTO(row) };
};

export const listSystemFiles: Handler = ({ query }) => {
  requireRole("SUPER_ADMIN");
  const kind = query.get("kind") ?? "";
  const items = tables.files
    .filter((f) => !f.deleted && (kind ? f.kind === kind : f.kind === "BACKUP" || f.kind === "EXPORT"))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 100);
  return { files: items.map(toFileDTO) };
};

export const runBackup: Handler = () => {
  const admin = requireRole("SUPER_ADMIN");
  const row = runtime.backup
    ? runtime.backup.run(admin.id, admin.email)
    : saveFile({
        kind: "BACKUP",
        relatedType: "SYSTEM",
        relatedId: "",
        name: "smart-rx-backup.json",
        mimeType: "application/json",
        dataBase64: utf8Base64(
          JSON.stringify({
            exportedAt: new Date().toISOString(),
            users: tables.users.map((u) => ({ ...u, passwordHash: "[redacted]" })),
            doctors: tables.doctors,
            chambers: tables.chambers,
            patients: tables.patients,
            prescriptions: tables.prescriptions,
            prescriptionMedicines: tables.prescriptionMedicines,
            templates: tables.templates,
            libraryItems: tables.libraryItems.filter((i) => i.isCustom),
          })
        ),
        user: admin,
      });
  audit(admin, "BACKUP", "FILE", row.id, row.name);
  return { file: toFileDTO(row) };
};
