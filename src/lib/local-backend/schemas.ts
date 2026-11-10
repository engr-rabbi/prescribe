// Request-body validation (zod) shared by the in-browser backend.
// Pure module — no server or Prisma dependencies.

import { z } from "zod";

/** ISO-ish date string; invalid values are rejected with a 400. */
export const isoDateField = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date format");

/** "" | null | undefined → null; otherwise a non-negative integer. */
const intField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(0).nullable()
);

/** "" | null | undefined → null; otherwise a non-negative number. */
const floatField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().min(0).nullable()
);

/** "" | null → null; otherwise a Date parsed from an ISO string. */
const dateOrNull = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  isoDateField.nullable().transform((v) => (v ? new Date(v) : null))
);

const optionalString = z.string().optional();

// ----- patients -----

export const patientCreateSchema = z.object({
  name: z.string().trim().min(1, "Patient name is required"),
  ageYears: intField.optional(),
  ageMonths: intField.optional(),
  dob: dateOrNull.optional(),
  gender: z.string().default(""),
  mobile: z.string().default(""),
  address: z.string().default(""),
  weight: floatField.optional(),
  height: floatField.optional(),
  bloodGroup: z.string().default(""),
  allergies: z.string().default(""),
  medicalHistory: z.string().default(""),
});

// NOTE: not `patientCreateSchema.partial()` — in zod 4 a field's .default("") still fires on a
// partial schema, so a PUT containing only { address } silently blanked mobile, gender, allergies…
export const patientUpdateSchema = z.object({
  name: z.string().trim().min(1, "Patient name is required").optional(),
  ageYears: intField.optional(),
  ageMonths: intField.optional(),
  dob: dateOrNull.optional(),
  gender: z.string().optional(),
  mobile: z.string().optional(),
  address: z.string().optional(),
  weight: floatField.optional(),
  height: floatField.optional(),
  bloodGroup: z.string().optional(),
  allergies: z.string().optional(),
  medicalHistory: z.string().optional(),
});

// ----- prescriptions (clinical data, matches PrescriptionData in types.ts) -----

export const medicineLineSchema = z.object({
  medicineId: z.number().int().nullable().optional(),
  brandName: z.string().trim().min(1, "brandName is required"),
  generic: z.string().default(""),
  strength: z.string().default(""),
  dosageForm: z.string().default(""),
  manufacturer: z.string().default(""),
  dose: z.string().default(""),
  route: z.string().default("Oral"),
  frequency: z.string().default(""),
  mealTiming: z.string().default(""),
  duration: z.string().default(""),
  specialInstruction: z.string().default(""),
  customText: z.string().default(""),
});

export const prescriptionDataSchema = z.object({
  chiefComplaints: z
    .array(
      z.object({
        id: z.string().default(""),
        label: z.string().default(""),
        labelBn: z.string().default(""),
        duration: z.string().default(""),
        severity: z.string().default(""),
        details: z.string().default(""),
      })
    )
    .default([]),
  history: z
    .object({
      presentIllness: z.string().default(""),
      pastMedical: z.string().default(""),
      pastSurgical: z.string().default(""),
      drugHistory: z.string().default(""),
      familyHistory: z.string().default(""),
      personalHistory: z.string().default(""),
      socialHistory: z.string().default(""),
      allergyHistory: z.string().default(""),
      occupationalHistory: z.string().default(""),
      menstrualHistory: z.string().default(""),
      obstetricHistory: z.string().default(""),
      immunizationHistory: z.string().default(""),
      dietaryHistory: z.string().default(""),
      previousInvestigations: z.string().default(""),
    })
    .optional(),
  vitals: z
    .object({
      bpSystolic: optionalString,
      bpDiastolic: optionalString,
      pulse: optionalString,
      temperature: optionalString,
      respiratoryRate: optionalString,
      spo2: optionalString,
      weight: optionalString,
      height: optionalString,
    })
    .optional(),
  examinations: z
    .array(
      z.object({
        id: z.string().default(""),
        label: z.string().default(""),
        labelBn: z.string().default(""),
        value: z.string().default(""),
      })
    )
    .default([]),
  diagnosis: z
    .array(
      z.object({
        id: z.string().default(""),
        label: z.string().default(""),
        labelBn: z.string().default(""),
        icd10: z.string().default(""),
        type: z.enum(["primary", "secondary"]).default("primary"),
      })
    )
    .default([]),
  investigations: z
    .array(
      z.object({
        id: z.string().default(""),
        label: z.string().default(""),
        note: z.string().default(""),
      })
    )
    .default([]),
  medicines: z.array(medicineLineSchema).default([]),
  advice: z
    .array(
      z.object({
        id: z.string().default(""),
        label: z.string().default(""),
        labelBn: z.string().default(""),
      })
    )
    .default([]),
  followUp: z
    .object({
      date: isoDateField.optional(),
      note: z.string().default(""),
    })
    .optional(),
});

export type PrescriptionDataInput = z.output<typeof prescriptionDataSchema>;

export const prescriptionUpsertSchema = z.object({
  id: z.string().optional(),
  patientId: z.string().min(1, "patientId is required"),
  doctorId: z.string().optional(),
  chamberId: z.string().nullable().optional(),
  template: z.string().optional(),
  templateConfig: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  data: prescriptionDataSchema,
});

export const prescriptionUpdateSchema = prescriptionUpsertSchema.omit({ id: true });

// Normalize an incoming save payload. The editor may send either the canonical
// shape { patientId, data: PrescriptionData, templateConfig: object } or a flat
// shape { patientId, chiefComplaints, history, examination, ..., templateConfig: string }.
 
export function normalizePrescriptionBody(raw: any) {
  const b = { ...raw };
  // templateConfig: string (JSON) → object
  if (typeof b.templateConfig === "string") {
    try {
      b.templateConfig = b.templateConfig.trim() ? JSON.parse(b.templateConfig) : {};
    } catch {
      b.templateConfig = {};
    }
  }
  // Flat clinical fields → nested `data`
  if (!b.data) {
    const {
      chiefComplaints,
      history,
      examination,
      vitals,
      examinations,
      diagnosis,
      investigations,
      advice,
      followUp,
      followUpDate,
      followUpNote,
       
      ...rest
    } = b;
    const examObj =
      examination && typeof examination === "object"
        ? examination
        : { vitals: vitals ?? {}, examinations: examinations ?? [] };
    const followUpObj =
      followUp && typeof followUp === "object"
        ? followUp
        : { date: followUpDate ?? undefined, note: followUpNote ?? "" };
    b.data = {
      chiefComplaints: chiefComplaints ?? [],
      history,
      vitals: examObj.vitals ?? {},
      examinations: examObj.examinations ?? [],
      diagnosis: diagnosis ?? [],
      investigations: investigations ?? [],
      medicines: b.medicines ?? [],
      advice: advice ?? [],
      followUp: followUpObj,
    };
    // keep template/notes/patientId/doctorId on the top level (rest)
    void rest;
  }
  // Medicines may also live on the top level even when `data` exists
  if (b.data && !b.data.medicines && Array.isArray(b.medicines)) {
    b.data.medicines = b.medicines;
  }
  return b;
}

// ----- templates -----

export const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Template name is required"),
  templateKey: z.string().trim().min(1, "templateKey is required"),
  config: z.record(z.string(), z.unknown()).default({}),
  isDefault: z.boolean().default(false),
});

// ----- auth -----

export const loginSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

// ----- libraries -----

export const LIBRARY_CATEGORIES = [
  "COMPLAINT",
  "HISTORY",
  "EXAM",
  "DIAGNOSIS",
  "INVESTIGATION",
  "ADVICE",
] as const;

export const libraryCategorySchema = z.enum(LIBRARY_CATEGORIES);

export const libraryCreateSchema = z.object({
  category: libraryCategorySchema,
  subcategory: z.string().default(""),
  labelEn: z.string().trim().min(1, "labelEn is required"),
  labelBn: z.string().default(""),
  code: z.string().default(""),
});

// ----- admin -----

export const roleSchema = z.enum(["SUPER_ADMIN", "DOCTOR", "ASSISTANT"]);

export const createUserSchema = z.object({
  email: z.string().email("A valid email is required"),
  name: z.string().trim().min(1, "Name is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: roleSchema,
});

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().trim().min(1, "Name cannot be empty").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  role: roleSchema.optional(),
});


// ----- doctor profile (zod strips unknown keys → doubles as the field whitelist) -----

export const profileUpdateSchema = z.object({
  fullName: z.string().optional(),
  professionalTitle: z.string().optional(),
  specialization: z.string().optional(),
  bmdcNo: z.string().optional(),
  designation: z.string().optional(),
  hospitalName: z.string().optional(),
  chamberAddress: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  photoUrl: z.string().optional(),
  signatureUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  consultationSchedule: z.string().optional(),
  headerNote: z.string().optional(),
  footerNote: z.string().optional(),
  activeTemplate: z.string().optional(),
  themeColor: z.string().optional(),
  fontFamily: z.string().optional(),
  headerLayout: z.string().optional(),
  showLogo: z.boolean().optional(),
  showPhoto: z.boolean().optional(),
});

export const reviseSchema = z.object({ revisionNote: z.string().default("") });
