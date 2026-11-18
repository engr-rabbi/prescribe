"use client";

// English / Bengali (বাংলা) language system with a top-bar toggle.
// The language affects the application UI. Prescription clinical content
// is displayed in the language it was entered in.

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "en" | "bn";

const DICT = {
  // App / shell
  appName: { en: "Smart Rx", bn: "স্মার্ট প্রেসক্রিপশন" },
  appTagline: { en: "Digital Prescription Management", bn: "ডিজিটাল প্রেসক্রিপশন ব্যবস্থাপনা" },
  // Nav
  dashboard: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  newPrescription: { en: "New Prescription", bn: "নতুন প্রেসক্রিপশন" },
  patients: { en: "Patients", bn: "রোগী" },
  prescriptions: { en: "Prescriptions", bn: "প্রেসক্রিপশন" },
  profile: { en: "Doctor Profile", bn: "ডাক্তার প্রোফাইল" },
  templates: { en: "Templates", bn: "টেমপ্লেট" },
  admin: { en: "Administration", bn: "প্রশাসন" },
  logout: { en: "Logout", bn: "লগআউট" },
  login: { en: "Login", bn: "লগইন" },
  // Dashboard
  totalPatients: { en: "Total Patients", bn: "মোট রোগী" },
  todayPatients: { en: "Today's Patients", bn: "আজকের রোগী" },
  totalPrescriptions: { en: "Total Prescriptions", bn: "মোট প্রেসক্রিপশন" },
  todayPrescriptions: { en: "Today's Prescriptions", bn: "আজকের প্রেসক্রিপশন" },
  upcomingFollowUps: { en: "Upcoming Follow-ups", bn: "আসন্ন ফলোআপ" },
  recentPatients: { en: "Recent Patients", bn: "সাম্প্রতিক রোগী" },
  recentPrescriptions: { en: "Recent Prescriptions", bn: "সাম্প্রতিক প্রেসক্রিপশন" },
  quickActions: { en: "Quick Actions", bn: "দ্রুত কার্যক্রম" },
  noFollowUps: { en: "No upcoming follow-ups", bn: "কোনো আসন্ন ফলোআপ নেই" },
  // Patients
  searchPatients: { en: "Search by name, phone or ID…", bn: "নাম, ফোন বা আইডি দিয়ে খুঁজুন…" },
  registerPatient: { en: "Register Patient", bn: "রোগী নিবন্ধন" },
  editPatient: { en: "Edit Patient", bn: "রোগী সম্পাদনা" },
  patientDetails: { en: "Patient Details", bn: "রোগীর বিবরণ" },
  consultationHistory: { en: "Consultation History", bn: "চিকিৎসা ইতিহাস" },
  newConsultation: { en: "New Consultation", bn: "নতুন পরামর্শ" },
  patientId: { en: "Patient ID", bn: "রোগী আইডি" },
  name: { en: "Name", bn: "নাম" },
  age: { en: "Age", bn: "বয়স" },
  gender: { en: "Gender", bn: "লিঙ্গ" },
  male: { en: "Male", bn: "পুরুষ" },
  female: { en: "Female", bn: "মহিলা" },
  other: { en: "Other", bn: "অন্যান্য" },
  mobile: { en: "Mobile Number", bn: "মোবাইল নম্বর" },
  address: { en: "Address", bn: "ঠিকানা" },
  weight: { en: "Weight (kg)", bn: "ওজন (কেজি)" },
  height: { en: "Height (cm)", bn: "উচ্চতা (সেমি)" },
  bloodGroup: { en: "Blood Group", bn: "রক্তের গ্রুপ" },
  allergies: { en: "Allergies", bn: "অ্যালার্জি" },
  medicalHistory: { en: "Previous Medical History", bn: "পূর্বের চিকিৎসা ইতিহাস" },
  save: { en: "Save", bn: "সংরক্ষণ" },
  cancel: { en: "Cancel", bn: "বাতিল" },
  edit: { en: "Edit", bn: "সম্পাদনা" },
  delete: { en: "Delete", bn: "মুছুন" },
  duplicate: { en: "Duplicate", bn: "অনুলিপি" },
  view: { en: "View", bn: "দেখুন" },
  search: { en: "Search", bn: "খুঁজুন" },
  noPatients: { en: "No patients found", bn: "কোনো রোগী পাওয়া যায়নি" },
  dateOfBirth: { en: "Date of Birth", bn: "জন্ম তারিখ" },
  years: { en: "Years", bn: "বছর" },
  months: { en: "Months", bn: "মাস" },
  // Prescription editor
  rxEditor: { en: "Prescription Editor", bn: "প্রেসক্রিপশন সম্পাদক" },
  livePreview: { en: "Live Preview", bn: "লাইভ প্রিভিউ" },
  chiefComplaints: { en: "Chief Complaints", bn: "প্রধান সমস্যা" },
  history: { en: "History", bn: "রোগের ইতিহাস" },
  onExamination: { en: "On Examination", bn: "পরীক্ষা-নিরীক্ষা" },
  diagnosis: { en: "Diagnosis", bn: "রোগ নির্ণয়" },
  investigations: { en: "Investigations", bn: "পরীক্ষা" },
  medicines: { en: "Medicines", bn: "ঔষধ" },
  advice: { en: "Advice", bn: "পরামর্শ" },
  followUp: { en: "Follow-up", bn: "পুনর্মূল্যায়ন" },
  vitals: { en: "Vitals", bn: "শারীরিক অবস্থা" },
  clinicalFindings: { en: "Clinical Findings", bn: "ক্লিনিকাল ফাইন্ডিংস" },
  addComplaint: { en: "Add complaint…", bn: "সমস্যা যোগ করুন…" },
  addDiagnosis: { en: "Add diagnosis…", bn: "রোগ নির্ণয় যোগ করুন…" },
  addInvestigation: { en: "Add investigation…", bn: "পরীক্ষা যোগ করুন…" },
  addAdvice: { en: "Add advice…", bn: "পরামর্শ যোগ করুন…" },
  addMedicine: { en: "Add medicine — search brand / generic / company…", bn: "ঔষধ যোগ করুন — ব্র্যান্ড / জেনেরিক / কোম্পানি খুঁজুন…" },
  duration: { en: "Duration", bn: "কত দিন" },
  frequency: { en: "Frequency", bn: "সেবনবিধি" },
  mealTiming: { en: "Meal Timing", bn: "খাবারের সময়" },
  dose: { en: "Dose", bn: "মাত্রা" },
  route: { en: "Route", bn: "প্রয়োগপদ্ধতি" },
  instruction: { en: "Special Instruction", bn: "বিশেষ নির্দেশনা" },
  selectPatient: { en: "Select patient…", bn: "রোগী নির্বাচন করুন…" },
  patient: { en: "Patient", bn: "রোগী" },
  primary: { en: "Primary", bn: "প্রধান" },
  secondary: { en: "Secondary", bn: "গৌণ" },
  saveDraft: { en: "Save Draft", bn: "ড্রাফট সংরক্ষণ" },
  finalize: { en: "Finalize & Sign", bn: "চূড়ান্ত ও স্বাক্ষর" },
  print: { en: "Print", bn: "প্রিন্ট" },
  downloadPdf: { en: "Download PDF", bn: "পিডিএফ ডাউনলোড" },
  share: { en: "Share", bn: "শেয়ার" },
  template: { en: "Template", bn: "টেমপ্লেট" },
  presentIllness: { en: "History of Present Illness", bn: "বর্তমান অসুস্থতার ইতিহাস" },
  pastMedical: { en: "Past Medical History", bn: "পূর্বের রোগের ইতিহাস" },
  pastSurgical: { en: "Past Surgical History", bn: "পূর্বের অস্ত্রোপচারের ইতিহাস" },
  drugHistory: { en: "Drug History", bn: "পূর্বের ঔষধের ইতিহাস" },
  familyHistory: { en: "Family History", bn: "পারিবারিক ইতিহাস" },
  personalHistory: { en: "Personal History", bn: "ব্যক্তিগত ইতিহাস" },
  socialHistory: { en: "Social History", bn: "সামাজিক ইতিহাস" },
  allergyHistory: { en: "Allergy History", bn: "অ্যালার্জির ইতিহাস" },
  occupationalHistory: { en: "Occupational History", bn: "পেশাগত ইতিহাস" },
  menstrualHistory: { en: "Menstrual History", bn: "মাসিকের ইতিহাস" },
  obstetricHistory: { en: "Obstetric History", bn: "প্রসূতি ইতিহাস" },
  immunizationHistory: { en: "Immunization History", bn: "টিকাদানের ইতিহাস" },
  dietaryHistory: { en: "Dietary History", bn: "খাদ্যাভ্যাসের ইতিহাস" },
  previousInvestigations: { en: "Previous Investigations", bn: "পূর্বের পরীক্ষা-নিরীক্ষা" },
  severity: { en: "Severity", bn: "মাত্রা" },
  details: { en: "Additional Notes", bn: "অতিরিক্ত নোট" },
  bp: { en: "Blood Pressure", bn: "রক্তচাপ" },
  pulse: { en: "Pulse", bn: "নাড়ি" },
  temp: { en: "Temperature", bn: "তাপমাত্রা" },
  rr: { en: "Respiratory Rate", bn: "শ্বাসের হার" },
  spo2: { en: "SpO₂", bn: "অক্সিজেন (SpO₂)" },
  bmi: { en: "BMI", bn: "বিএমআই" },
  customEntry: { en: "Custom entry…", bn: "নিজের লেখা যোগ করুন…" },
  clickToSelect: { en: "Click to select or type", bn: "ক্লিক করে নির্বাচন করুন বা লিখুন" },
  // Prescription list
  rxHistory: { en: "Prescription History", bn: "প্রেসক্রিপশন ইতিহাস" },
  rxCode: { en: "Rx Code", bn: "প্রেসক্রিপশন কোড" },
  status: { en: "Status", bn: "অবস্থা" },
  draft: { en: "Draft", bn: "ড্রাফট" },
  finalized: { en: "Finalized", bn: "চূড়ান্ত" },
  revised: { en: "Revised", bn: "সংশোধিত" },
  revision: { en: "Revision", bn: "সংশোধনী" },
  createRevision: { en: "Create Revision", bn: "সংশোধনী তৈরি" },
  revisionNote: { en: "Revision Note", bn: "সংশোধনীর কারণ" },
  date: { en: "Date", bn: "তারিখ" },
  actions: { en: "Actions", bn: "কার্যক্রম" },
  // Profile
  fullName: { en: "Full Name", bn: "পূর্ণ নাম" },
  professionalTitle: { en: "Academic Qualifications", bn: "একাডেমিক যোগ্যতা" },
  specializationField: { en: "Specialization", bn: "বিশেষত্ব" },
  bmdcNo: { en: "BMDC Registration No.", bn: "বিএমডিসি রেজিস্ট্রেশন নং" },
  designation: { en: "Designation", bn: "পদবি" },
  hospitalName: { en: "Hospital / Clinic", bn: "হাসপাতাল / ক্লিনিক" },
  chamberAddress: { en: "Chamber Address", bn: "চেম্বারের ঠিকানা" },
  email: { en: "Email", bn: "ইমেইল" },
  phone: { en: "Contact Number", bn: "যোগাযোগ নম্বর" },
  photo: { en: "Photograph", bn: "ছবি" },
  signature: { en: "Signature", bn: "স্বাক্ষর" },
  logo: { en: "Chamber Logo", bn: "চেম্বার লোগো" },
  consultationSchedule: { en: "Consultation Schedule", bn: "পরামর্শের সময়সূচি" },
  headerNote: { en: "Header Text", bn: "হেডার লেখা" },
  footerNote: { en: "Footer Text", bn: "ফুটার লেখা" },
  upload: { en: "Upload", bn: "আপলোড" },
  remove: { en: "Remove", bn: "সরান" },
  profileSaved: { en: "Profile saved successfully", bn: "প্রোফাইল সফলভাবে সংরক্ষিত" },
  // Admin
  userManagement: { en: "User Management", bn: "ব্যবহারকারী ব্যবস্থাপনা" },
  medicineDatabase: { en: "Medicine Database", bn: "ঔষধ ডাটাবেস" },
  auditLogs: { en: "Audit Logs", bn: "অডিট লগ" },
  importStatus: { en: "Import Status", bn: "ইমপোর্ট অবস্থা" },
  addUser: { en: "Add User", bn: "ব্যবহারকারী যোগ করুন" },
  role: { en: "Role", bn: "ভূমিকা" },
  superAdmin: { en: "Super Admin", bn: "সুপার অ্যাডমিন" },
  doctor: { en: "Doctor", bn: "ডাক্তার" },
  assistant: { en: "Assistant", bn: "সহকারী" },
  active: { en: "Active", bn: "সক্রিয়" },
  inactive: { en: "Inactive", bn: "নিষ্ক্রিয়" },
  // Auth
  signIn: { en: "Sign in to your account", bn: "আপনার অ্যাকাউন্টে সাইন ইন করুন" },
  password: { en: "Password", bn: "পাসওয়ার্ড" },
  invalidCredentials: { en: "Invalid email or password", bn: "ভুল ইমেইল বা পাসওয়ার্ড" },
  // Common
  loading: { en: "Loading…", bn: "লোড হচ্ছে…" },
  noResults: { en: "No results found", bn: "কোনো ফলাফল পাওয়া যায়নি" },
  confirmDelete: { en: "Are you sure you want to delete?", bn: "আপনি কি নিশ্চিতভাবে মুছতে চান?" },
  saved: { en: "Saved successfully", bn: "সফলভাবে সংরক্ষিত" },
  error: { en: "Something went wrong", bn: "কিছু ভুল হয়েছে" },
  required: { en: "This field is required", bn: "এই ঘরটি পূরণ করুন" },
  totalRecords: { en: "records", bn: "টি রেকর্ড" },
  followUpDate: { en: "Follow-up Date", bn: "ফলোআপের তারিখ" },
  followUpNote: { en: "Follow-up Instructions", bn: "ফলোআপ নির্দেশনা" },
  notes: { en: "Notes", bn: "নোট" },
  // Rx preview
  rxSymbol: { en: "℞", bn: "℞" },
  consultedBy: { en: "Consulted By", bn: "চিকিৎসক" },
  nextVisit: { en: "Next Visit", bn: "পরবর্তী সাক্ষাৎ" },
  // Chamber & Schedule
  chamberName: { en: "Clinic / Hospital / Chamber Name", bn: "ক্লিনিক / হাসপাতাল / চেম্বারের নাম" },
  chamberDays: { en: "Consultation Days", bn: "পরামর্শের দিন" },
  chamberTime: { en: "Consultation Time", bn: "পরামর্শের সময়" },
  chamberSerial: { en: "Serial Booking Information", bn: "সিরিয়াল বুকিংয়ের তথ্য" },
  chamberPhone: { en: "Contact Number", bn: "যোগাযোগ নম্বর" },
  chambers: { en: "Chambers & Schedules", bn: "চেম্বার ও সময়সূচি" },
  chambersDesc: {
    en: "Add one profile per chamber — the primary chamber appears on prescriptions.",
    bn: "প্রতিটি চেম্বারের জন্য আলাদা প্রোফাইল যোগ করুন — প্রধান চেম্বারটি প্রেসক্রিপশনে দেখা যাবে।",
  },
  addChamber: { en: "Add Chamber", bn: "চেম্বার যোগ করুন" },
  editChamber: { en: "Edit Chamber", bn: "চেম্বার সম্পাদনা" },
  noChambers: { en: "No chamber added yet", bn: "এখনো কোনো চেম্বার যোগ করা হয়নি" },
  primaryChamber: { en: "Primary", bn: "প্রধান" },
  setPrimary: { en: "Set as Primary", bn: "প্রধান করুন" },
  selectChamber: { en: "Chamber for this prescription", bn: "এই প্রেসক্রিপশনের চেম্বার" },
  chamberDefault: { en: "Default (primary chamber)", bn: "ডিফল্ট (প্রধান চেম্বার)" },
  // Universal picker
  addItem: { en: "Click to select or search…", bn: "ক্লিক করে নির্বাচন বা খুঁজুন…" },
  selectItems: { en: "Select items", bn: "নির্বাচন করুন" },
  selected: { en: "Selected", bn: "নির্বাচিত" },
  addSelected: { en: "Add selected", bn: "নির্বাচিত যোগ করুন" },
  allCategories: { en: "All", bn: "সব" },
  typeCustomEntry: { en: "Not found? Type your own entry…", bn: "পাওয়া যায়নি? নিজের লেখা যোগ করুন…" },
  addCustomEntry: { en: "Add & use now", bn: "যোগ করে ব্যবহার করুন" },
  customSavedNote: { en: "Custom entries are saved for reuse", bn: "নিজের লেখাগুলো পরবর্তীতে ব্যবহারের জন্য সংরক্ষিত হবে" },
  itemsCount: { en: "items", bn: "টি" },
  closePicker: { en: "Done", bn: "ঠিক আছে" },
} as const;

export type DictKey = keyof typeof DICT;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: DictKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  toggleLang: () => {},
  t: (k) => String(k),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    // Hydration-safe language restore: read persisted preference after mount.
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("rx_lang");
    } catch {
      /* storage blocked */
    }
     
    if (saved === "bn" || saved === "en") setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("rx_lang", l);
    } catch {
      /* storage blocked */
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = prev === "en" ? "bn" : "en";
      try {
        window.localStorage.setItem("rx_lang", next);
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, []);

  const t = useCallback(
    (key: DictKey) => {
      const entry = DICT[key];
      return entry ? entry[lang] : String(key);
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

// Format a number into Bengali digits when lang is bn
export function localizeDigits(input: string | number, lang: Lang): string {
  const enDigits = "0123456789";
  const bnDigits = "০১২৩৪৫৬৭৮৯";
  let s = String(input);
  if (lang === "bn") {
    s = s.replace(/[0-9]/g, (d) => bnDigits[enDigits.indexOf(d)]);
  }
  return s;
}
