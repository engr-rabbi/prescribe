// Shared domain types for the Smart Digital Prescription Management System.

export type Role = "SUPER_ADMIN" | "DOCTOR" | "ASSISTANT";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  doctorId?: string;
}

// ---------------------------------------------------------------------------
// Prescription clinical data (stored as JSON in DB)
// ---------------------------------------------------------------------------

export interface ChiefComplaint {
  id: string;
  label: string;
  labelBn?: string;
  duration: string;
  severity?: string;
  details?: string;
}

export interface HistorySection {
  presentIllness: string;
  pastMedical: string;
  pastSurgical: string;
  drugHistory: string;
  familyHistory: string;
  personalHistory: string;
  socialHistory: string;
  allergyHistory: string;
  occupationalHistory: string;
  menstrualHistory: string;
  obstetricHistory: string;
  immunizationHistory: string;
  dietaryHistory: string;
  previousInvestigations: string;
}

export const EMPTY_HISTORY: HistorySection = {
  presentIllness: "",
  pastMedical: "",
  pastSurgical: "",
  drugHistory: "",
  familyHistory: "",
  personalHistory: "",
  socialHistory: "",
  allergyHistory: "",
  occupationalHistory: "",
  menstrualHistory: "",
  obstetricHistory: "",
  immunizationHistory: "",
  dietaryHistory: "",
  previousInvestigations: "",
};

export interface Vitals {
  bpSystolic?: string;
  bpDiastolic?: string;
  pulse?: string;
  temperature?: string;
  respiratoryRate?: string;
  spo2?: string;
  weight?: string;
  height?: string;
}

export interface ExamFinding {
  id: string;
  label: string;
  labelBn?: string;
  value: string;
}

export interface DiagnosisItem {
  id: string;
  label: string;
  labelBn?: string;
  icd10?: string;
  type: "primary" | "secondary";
}

export interface InvestigationItem {
  id: string;
  label: string;
  note?: string;
}

export interface AdviceItem {
  id: string;
  label: string;
  labelBn?: string;
}

export interface FollowUp {
  date?: string; // ISO date
  note?: string;
}

export interface MedicineLine {
  // local only id for UI keys
  _uid: string;
  // link to master data (null for fully custom entries)
  medicineId?: number | null;
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
}

export interface PrescriptionData {
  chiefComplaints: ChiefComplaint[];
  history: HistorySection;
  vitals: Vitals;
  examinations: ExamFinding[];
  diagnosis: DiagnosisItem[];
  investigations: InvestigationItem[];
  medicines: MedicineLine[];
  advice: AdviceItem[];
  followUp: FollowUp;
}

export const EMPTY_PRESCRIPTION: PrescriptionData = {
  chiefComplaints: [],
  history: EMPTY_HISTORY,
  vitals: {},
  examinations: [],
  diagnosis: [],
  investigations: [],
  medicines: [],
  advice: [],
  followUp: {},
};

// ---------------------------------------------------------------------------
// DTOs returned by APIs
// ---------------------------------------------------------------------------

export interface MedicineRecord {
  id: number;
  brandName: string;
  type: string;
  slug: string;
  dosageForm: string;
  generic: string;
  strength: string;
  manufacturer: string;
  packageContainer: string;
  packageSize: string;
}

export interface PatientDTO {
  id: string;
  code: string;
  name: string;
  ageYears?: number | null;
  ageMonths?: number | null;
  dob?: string | null;
  gender: string;
  mobile: string;
  address: string;
  weight?: number | null;
  height?: number | null;
  bloodGroup: string;
  allergies: string;
  medicalHistory: string;
  createdAt: string;
  prescriptionCount?: number;
  lastVisit?: string | null;
}

export interface PrescriptionMedicineDTO {
  id: string;
  sortOrder: number;
  medicineId?: number | null;
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
}

export interface PrescriptionDTO {
  id: string;
  code: string;
  status: "DRAFT" | "FINALIZED";
  version: number;
  rootId?: string | null;
  revisionNote: string;
  prescriptionDate: string;
  chiefComplaints: ChiefComplaint[];
  history: HistorySection;
  examination: { vitals: Vitals; examinations: ExamFinding[] };
  diagnosis: DiagnosisItem[];
  investigations: InvestigationItem[];
  advice: AdviceItem[];
  followUpDate?: string | null;
  followUpNote: string;
  template: string;
  templateConfig: string;
  notes: string;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  patient: PatientDTO;
  doctor: DoctorProfileDTO;
  chamberId?: string | null;
  chamber?: ChamberDTO | null;
  medicines: PrescriptionMedicineDTO[];
}

export interface ChamberDTO {
  id: string;
  doctorId: string;
  name: string;
  address: string;
  days: string;
  time: string;
  phone: string;
  serialInfo: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface DoctorProfileDTO {
  id: string;
  userId: string;
  fullName: string;
  professionalTitle: string;
  specialization: string;
  bmdcNo: string;
  designation: string;
  hospitalName: string;
  chamberAddress: string;
  phone: string;
  email: string;
  photoUrl: string;
  signatureUrl: string;
  logoUrl: string;
  consultationSchedule: string;
  headerNote: string;
  footerNote: string;
  activeTemplate: string;
  themeColor: string;
  fontFamily: string;
  headerLayout: string;
  showLogo: boolean;
  showPhoto: boolean;
}

export interface LibraryItemDTO {
  id: string;
  category: string;
  subcategory: string;
  labelEn: string;
  labelBn: string;
  code: string;
  isCustom: boolean;
  usageCount: number;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalPatients: number;
  todayPatients: number;
  totalPrescriptions: number;
  todayPrescriptions: number;
  upcomingFollowUps: {
    id: string;
    code: string;
    patientName: string;
    patientCode: string;
    followUpDate: string;
    doctorName: string;
  }[];
  recentPatients: PatientDTO[];
  recentPrescriptions: {
    id: string;
    code: string;
    status: string;
    prescriptionDate: string;
    patientName: string;
    patientCode: string;
    doctorName: string;
  }[];
}

// Template configuration (per doctor customization)
export interface TemplateConfig {
  fontFamily?: "serif" | "sans" | "mixed";
  accentColor?: string;
  headerLayout?: "centered" | "split" | "banner";
  showLogo?: boolean;
  showPhoto?: boolean;
  showWatermark?: boolean;
  columnLayout?: "two-col" | "single-col";
}

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  fontFamily: "serif",
  accentColor: "#0f766e",
  headerLayout: "centered",
  showLogo: true,
  showPhoto: false,
  showWatermark: false,
  columnLayout: "two-col",
};
