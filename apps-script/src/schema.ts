// Google Sheets layout. One worksheet per table; row 1 = header; first column is
// always the unique `id`. Foreign keys are plain id columns (patientId, doctorId …),
// so the whole thing maps 1:1 onto relational tables if you later move to PostgreSQL
// (see docs/DATA-MODEL.md).
//
// Column types: s=text · sn=text|NULL · n=number · nn=number|NULL · b=boolean

import type { TableName } from "../../src/lib/local-backend/store";

export type ColType = "s" | "sn" | "n" | "nn" | "b";
export interface Col {
  key: string;
  type: ColType;
}
export interface SheetSpec {
  table: TableName;
  sheet: string;
  description: string;
  cols: Col[];
  /** only rows matching are read from / written to this sheet (library sheets share one table) */
  filter?: (row: Record<string, unknown>) => boolean;
}

const c = (spec: string): Col[] =>
  spec.split(/\s+/).map((p) => {
    const [key, type] = p.split(":");
    return { key, type: (type || "s") as ColType };
  });

export const USERS = c("id email name role passwordHash active:b createdAt updatedAt");
export const DOCTORS = c(
  "id userId fullName professionalTitle specialization bmdcNo designation hospitalName chamberAddress phone email photoUrl signatureUrl logoUrl consultationSchedule headerNote footerNote activeTemplate themeColor fontFamily headerLayout showLogo:b showPhoto:b createdAt updatedAt"
);
export const CHAMBERS = c(
  "id doctorId name address days time phone serialInfo isPrimary:b sortOrder:n createdAt updatedAt"
);
export const PATIENTS = c(
  "id code name ageYears:nn ageMonths:nn dob:sn gender mobile address weight:nn height:nn bloodGroup allergies medicalHistory createdById:sn createdAt updatedAt"
);
export const PRESCRIPTIONS = c(
  "id code patientId doctorId status version:n rootId:sn revisionNote supersededById:sn prescriptionDate chiefComplaints history examination diagnosis investigations advice followUpDate:sn followUpNote template templateConfig notes finalizedAt:sn finalizedById:sn createdAt updatedAt chamberId:sn"
);
export const RX_MEDICINES = c(
  "id prescriptionId sortOrder:n medicineId:nn brandName generic strength dosageForm manufacturer dose route frequency mealTiming duration specialInstruction customText"
);
export const TEMPLATES = c("id doctorId name templateKey config isDefault:b createdAt updatedAt");
export const LIBRARY = c("id category subcategory labelEn labelBn code keywords isCustom:b createdById:sn usageCount:n createdAt");
export const FILES = c(
  "id storageKey name mimeType size:n kind relatedType relatedId folderPath ownerUserId ownerEmail createdAt deleted:b"
);
export const AUDIT = c("id userId:sn userEmail userRole action entity entityId details createdAt");

const libOf = (category: string) => (r: Record<string, unknown>) => r.category === category && r.isCustom !== true;

/** Table-backed sheets (read & written by the application). */
export const TABLE_SHEETS: SheetSpec[] = [
  { table: "users", sheet: "Users", description: "User accounts, roles and PASSWORD HASHES (never plain text)", cols: USERS },
  { table: "doctors", sheet: "Doctors", description: "Doctor profiles (images are Drive references)", cols: DOCTORS },
  { table: "chambers", sheet: "Chambers", description: "Chambers + doctor schedule (days / time / serial info)", cols: CHAMBERS },
  { table: "patients", sheet: "Patients", description: "Patient register incl. allergies & medical history", cols: PATIENTS },
  { table: "prescriptions", sheet: "Prescriptions", description: "Prescription records (complaints, history, exam, diagnosis, investigations, advice, follow-up)", cols: PRESCRIPTIONS },
  { table: "prescriptionMedicines", sheet: "PrescriptionMedicines", description: "Medicine lines of each prescription", cols: RX_MEDICINES },
  { table: "templates", sheet: "Templates", description: "Saved print templates", cols: TEMPLATES },
  { table: "libraryItems", sheet: "ChiefComplaints", description: "Chief-complaint library", cols: LIBRARY, filter: libOf("COMPLAINT") },
  { table: "libraryItems", sheet: "HistoryPresets", description: "History presets", cols: LIBRARY, filter: libOf("HISTORY") },
  { table: "libraryItems", sheet: "ExamFindings", description: "Examination findings library", cols: LIBRARY, filter: libOf("EXAM") },
  { table: "libraryItems", sheet: "Diagnoses", description: "Diagnosis database", cols: LIBRARY, filter: libOf("DIAGNOSIS") },
  { table: "libraryItems", sheet: "Investigations", description: "Investigation / medical test database", cols: LIBRARY, filter: libOf("INVESTIGATION") },
  { table: "libraryItems", sheet: "Advice", description: "Advice database", cols: LIBRARY, filter: libOf("ADVICE") },
  { table: "libraryItems", sheet: "CustomEntries", description: "Entries added by users (any category)", cols: LIBRARY, filter: (r) => r.isCustom === true },
  { table: "files", sheet: "Files", description: "File registry: Drive file id, name, MIME type, owner, related record", cols: FILES },
];

/** Plain-text sheets handled specially (not in the table model). */
export const MEDICINES = c("id brandName type slug dosageForm generic strength manufacturer packageContainer packageSize");

export const EXTRA_SHEETS: { sheet: string; description: string; cols: Col[] }[] = [
  { sheet: "Medicines", description: "Medicine master catalogue (edit here, then Admin → Re-import)", cols: MEDICINES },
  { sheet: "AuditLogs", description: "Append-only audit trail", cols: AUDIT },
  { sheet: "SystemSettings", description: "System settings (key / value)", cols: c("key value description updatedAt") },
  { sheet: "Roles", description: "Role → permission matrix (reference; enforced in code)", cols: c("role permission allowed:b description") },
  { sheet: "FollowUps", description: "Follow-up records (derived from prescriptions — read-only view)", cols: c("id prescriptionId prescriptionCode patientId patientCode doctorId followUpDate followUpNote status updatedAt") },
  { sheet: "PatientMedicalHistory", description: "Per-visit medical history (derived from prescriptions — read-only view)", cols: c("id prescriptionId patientId patientCode visitDate presentIllness pastMedical pastSurgical drugHistory familyHistory personalHistory socialHistory allergyHistory updatedAt") },
  { sheet: "Appointments", description: "Reserved for an appointment module (not used by the current UI)", cols: c("id patientId doctorId chamberId scheduledAt status note createdAt updatedAt") },
];

export const ALL_SHEET_NAMES = [
  ...new Set([...TABLE_SHEETS.map((s) => s.sheet), ...EXTRA_SHEETS.map((s) => s.sheet)]),
];

export const ROLE_MATRIX: [string, string, boolean, string][] = [
  ["SUPER_ADMIN", "manage_users", true, "Create / edit / deactivate users"],
  ["SUPER_ADMIN", "view_audit_logs", true, "View audit trail"],
  ["SUPER_ADMIN", "manage_medicine_database", true, "Re-import / validate the medicine catalogue"],
  ["SUPER_ADMIN", "run_backups_exports", true, "Backups and CSV exports to Drive"],
  ["SUPER_ADMIN", "create_edit_prescription", true, "Create, edit, duplicate, delete drafts"],
  ["SUPER_ADMIN", "finalize_revise_prescription", false, "Only the owning doctor"],
  ["DOCTOR", "create_edit_prescription", true, "Own prescriptions only"],
  ["DOCTOR", "finalize_revise_prescription", true, "Own prescriptions only"],
  ["DOCTOR", "manage_own_profile", true, "Profile, chambers, templates"],
  ["DOCTOR", "manage_users", false, ""],
  ["ASSISTANT", "manage_patients", true, "Register & update patients"],
  ["ASSISTANT", "view_prescriptions", true, "Read-only"],
  ["ASSISTANT", "upload_patient_documents", true, "Reports, images"],
  ["ASSISTANT", "create_edit_prescription", false, ""],
];
