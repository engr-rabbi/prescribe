// DTOs of the doctor ⇄ patient features, shared by the UI.

export interface QuestionField {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "yesno" | "select";
  options: string[];
  required: boolean;
}

export interface QuestionnaireDTO {
  id: string;
  doctorId: string;
  doctorName: string;
  title: string;
  description: string;
  active: boolean;
  fields: QuestionField[];
  updatedAt: string;
}

export interface PatientFormDTO extends QuestionnaireDTO {
  response: { answers: Record<string, string>; fieldUpdated: Record<string, string>; updatedAt: string } | null;
}

export interface AccessDTO {
  id: string;
  patientUid: string;
  doctorId: string;
  doctorName: string;
  status: "REQUESTED" | "GRANTED" | "DENIED" | "REVOKED";
  source: string;
  requestedAt: string;
  respondedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
}

export interface AppointmentDTO {
  id: string;
  patientUid: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  chamberId: string | null;
  preferredDate: string;
  preferredTime: string;
  reason: string;
  status: "REQUESTED" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "COMPLETED";
  scheduledAt: string | null;
  doctorNote: string;
  shareMedical: boolean;
  createdAt: string;
  consent?: boolean;
}

export interface DirectoryDoctor {
  id: string;
  code: string;
  name: string;
  title: string;
  specialization: string;
  hospitalName: string;
  chambers: { id: string; name: string; days: string; time: string }[];
}

export interface PatientAccountSummary {
  patientUid: string;
  fullName: string;
  gender: string;
  ageYears: number | null;
  mobile: string; // masked
  email: string; // masked
  access: "NONE" | "REQUESTED" | "GRANTED" | "DENIED" | "REVOKED";
}

export interface PatientAccountView {
  access: PatientAccountSummary["access"];
  basic: Omit<PatientAccountSummary, "access">;
  /** null until the patient has consented */
  medical: import("@/lib/local-backend/portal").ProfileDTO | null;
  forms: PatientFormDTO[];
  files: { id: string; name: string; kind: string; mimeType: string; size: number; createdAt: string }[];
}
