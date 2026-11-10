"use client";

import { create } from "zustand";
import { EMPTY_PRESCRIPTION, type MedicineLine, type PatientDTO, type PrescriptionData, type DoctorProfileDTO } from "@/lib/types";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newMedicineLine(): MedicineLine {
  return {
    _uid: uid(),
    medicineId: null,
    brandName: "",
    generic: "",
    strength: "",
    dosageForm: "",
    manufacturer: "",
    dose: "",
    route: "Oral",
    frequency: "",
    mealTiming: "",
    duration: "",
    specialInstruction: "",
    customText: "",
  };
}

interface PrescriptionState {
  prescriptionId: string | null; // null => creating new
  status: "DRAFT" | "FINALIZED";
  code: string;
  version: number;
  prescriptionDate: string; // ISO date of the loaded prescription ("" for new)
  patient: PatientDTO | null;
  doctor: DoctorProfileDTO | null;
  chamberId: string | null; // chamber shown on this prescription
  data: PrescriptionData;
  template: string;
  templateConfig: string; // JSON string
  notes: string;
  dirty: boolean;
  saving: boolean;

  setDoctor: (d: DoctorProfileDTO | null) => void;
  setPatient: (p: PatientDTO | null) => void;
  setChamberId: (id: string | null) => void;
  setTemplate: (t: string) => void;
  setTemplateConfig: (c: string) => void;
  setNotes: (n: string) => void;
  setDirty: (d: boolean) => void;
  setSaving: (s: boolean) => void;
  loadPrescription: (payload: {
    prescriptionId: string;
    status: "DRAFT" | "FINALIZED";
    code: string;
    version: number;
    prescriptionDate?: string;
    patient: PatientDTO | null;
    doctor: DoctorProfileDTO | null;
    chamberId?: string | null;
    data: PrescriptionData;
    template: string;
    templateConfig: string;
    notes: string;
  }) => void;
  resetEditor: () => void;

  // patient selection updates vitals weight/height too
  // complaints
  addComplaint: (label: string, labelBn?: string) => void;
  updateComplaint: (id: string, patch: Partial<{ label: string; labelBn?: string; duration: string; severity: string; details: string }>) => void;
  removeComplaint: (id: string) => void;
  // examinations (clinical findings)
  addExam: (label: string, labelBn?: string, value?: string) => void;
  updateExam: (id: string, patch: Partial<{ label: string; value: string }>) => void;
  removeExam: (id: string) => void;
  setVitals: (patch: Partial<PrescriptionData["vitals"]>) => void;
  setHistory: (patch: Partial<PrescriptionData["history"]>) => void;
  // diagnosis
  addDiagnosis: (label: string, labelBn?: string, icd10?: string) => void;
  updateDiagnosis: (id: string, patch: Partial<{ label: string; type: "primary" | "secondary" }>) => void;
  removeDiagnosis: (id: string) => void;
  // investigations
  addInvestigation: (label: string) => void;
  updateInvestigation: (id: string, patch: Partial<{ label: string; note: string }>) => void;
  removeInvestigation: (id: string) => void;
  // medicines
  addMedicine: (line?: Partial<MedicineLine>) => string;
  updateMedicine: (uidKey: string, patch: Partial<MedicineLine>) => void;
  removeMedicine: (uidKey: string) => void;
  moveMedicine: (uidKey: string, dir: -1 | 1) => void;
  // advice
  addAdvice: (label: string, labelBn?: string) => void;
  removeAdvice: (id: string) => void;
  // follow up
  setFollowUp: (patch: Partial<PrescriptionData["followUp"]>) => void;
}

const initialData: PrescriptionData = JSON.parse(JSON.stringify(EMPTY_PRESCRIPTION));

export const usePrescriptionStore = create<PrescriptionState>((set) => ({
  prescriptionId: null,
  status: "DRAFT",
  code: "",
  version: 1,
  prescriptionDate: "",
  patient: null,
  doctor: null,
  chamberId: null,
  data: initialData,
  template: "modern",
  templateConfig: "{}",
  notes: "",
  dirty: false,
  saving: false,

  setDoctor: (doctor) => set({ doctor }),
  setChamberId: (chamberId) => set({ chamberId, dirty: true }),
  setPatient: (patient) =>
    set((s) => ({
      patient,
      dirty: true,
      data: {
        ...s.data,
        vitals: {
          ...s.data.vitals,
          weight: patient?.weight != null ? String(patient.weight) : s.data.vitals.weight,
          height: patient?.height != null ? String(patient.height) : s.data.vitals.height,
        },
      },
    })),
  setTemplate: (template) => set({ template, dirty: true }),
  setTemplateConfig: (templateConfig) => set({ templateConfig, dirty: true }),
  setNotes: (notes) => set({ notes, dirty: true }),
  setDirty: (dirty) => set({ dirty }),
  setSaving: (saving) => set({ saving }),
  loadPrescription: (payload) => set({ ...payload, dirty: false }),
  resetEditor: () =>
    set({
      prescriptionId: null,
      status: "DRAFT",
      code: "",
      version: 1,
      prescriptionDate: "",
      patient: null,
      chamberId: null,
      data: JSON.parse(JSON.stringify(EMPTY_PRESCRIPTION)),
      template: "modern",
      templateConfig: "{}",
      notes: "",
      dirty: false,
    }),

  addComplaint: (label, labelBn) =>
    set((s) => ({
      dirty: true,
      data: { ...s.data, chiefComplaints: [...s.data.chiefComplaints, { id: uid(), label, labelBn, duration: "", severity: "", details: "" }] },
    })),
  updateComplaint: (id, patch) =>
    set((s) => ({
      dirty: true,
      data: {
        ...s.data,
        chiefComplaints: s.data.chiefComplaints.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })),
  removeComplaint: (id) =>
    set((s) => ({ dirty: true, data: { ...s.data, chiefComplaints: s.data.chiefComplaints.filter((c) => c.id !== id) } })),

  addExam: (label, labelBn, value = "") =>
    set((s) => ({
      dirty: true,
      data: { ...s.data, examinations: [...s.data.examinations, { id: uid(), label, labelBn, value }] },
    })),
  updateExam: (id, patch) =>
    set((s) => ({
      dirty: true,
      data: { ...s.data, examinations: s.data.examinations.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
    })),
  removeExam: (id) =>
    set((s) => ({ dirty: true, data: { ...s.data, examinations: s.data.examinations.filter((e) => e.id !== id) } })),
  setVitals: (patch) =>
    set((s) => ({ dirty: true, data: { ...s.data, vitals: { ...s.data.vitals, ...patch } } })),
  setHistory: (patch) =>
    set((s) => ({ dirty: true, data: { ...s.data, history: { ...s.data.history, ...patch } } })),

  addDiagnosis: (label, labelBn, icd10) =>
    set((s) => {
      const isFirst = s.data.diagnosis.length === 0;
      return {
        dirty: true,
        data: {
          ...s.data,
          diagnosis: [...s.data.diagnosis, { id: uid(), label, labelBn, icd10, type: isFirst ? ("primary" as const) : ("secondary" as const) }],
        },
      };
    }),
  updateDiagnosis: (id, patch) =>
    set((s) => ({
      dirty: true,
      data: { ...s.data, diagnosis: s.data.diagnosis.map((d) => (d.id === id ? { ...d, ...patch } : d)) },
    })),
  removeDiagnosis: (id) =>
    set((s) => ({ dirty: true, data: { ...s.data, diagnosis: s.data.diagnosis.filter((d) => d.id !== id) } })),

  addInvestigation: (label) =>
    set((s) => ({ dirty: true, data: { ...s.data, investigations: [...s.data.investigations, { id: uid(), label, note: "" }] } })),
  updateInvestigation: (id, patch) =>
    set((s) => ({
      dirty: true,
      data: { ...s.data, investigations: s.data.investigations.map((i) => (i.id === id ? { ...i, ...patch } : i)) },
    })),
  removeInvestigation: (id) =>
    set((s) => ({ dirty: true, data: { ...s.data, investigations: s.data.investigations.filter((i) => i.id !== id) } })),

  addMedicine: (line) => {
    const nl = { ...newMedicineLine(), ...line, _uid: uid() };
    set((s) => ({ dirty: true, data: { ...s.data, medicines: [...s.data.medicines, nl] } }));
    return nl._uid;
  },
  updateMedicine: (uidKey, patch) =>
    set((s) => ({
      dirty: true,
      data: { ...s.data, medicines: s.data.medicines.map((m) => (m._uid === uidKey ? { ...m, ...patch } : m)) },
    })),
  removeMedicine: (uidKey) =>
    set((s) => ({ dirty: true, data: { ...s.data, medicines: s.data.medicines.filter((m) => m._uid !== uidKey) } })),
  moveMedicine: (uidKey, dir) =>
    set((s) => {
      const arr = [...s.data.medicines];
      const idx = arr.findIndex((m) => m._uid === uidKey);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= arr.length) return s;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { dirty: true, data: { ...s.data, medicines: arr } };
    }),

  addAdvice: (label, labelBn) =>
    set((s) => ({ dirty: true, data: { ...s.data, advice: [...s.data.advice, { id: uid(), label, labelBn }] } })),
  removeAdvice: (id) =>
    set((s) => ({ dirty: true, data: { ...s.data, advice: s.data.advice.filter((a) => a.id !== id) } })),
  setFollowUp: (patch) =>
    set((s) => ({ dirty: true, data: { ...s.data, followUp: { ...s.data.followUp, ...patch } } })),
}));
