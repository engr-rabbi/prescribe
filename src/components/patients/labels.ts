// Local EN/BN label helpers for the Patients module (and small shared
// formatting utilities reused by the dashboard). Keys that already exist in
// the global DICT (src/lib/i18n.tsx) are NOT duplicated here — always
// prefer useI18n().t for those.

import { localizeDigits, type Lang } from "@/lib/i18n";
import { formatDate, formatPatientAge } from "@/lib/rx-utils";

export const PL = {
  en: {
    code: "Code",
    lastVisit: "Last Visit",
    rxCount: "Rx",
    newRx: "New Rx",
    open: "Open",
    viewAll: "View all",
    noConsultations: "No consultation history",
    duplicateConfirm: "Create a duplicate copy of this prescription?",
    duplicated: "Prescription duplicated",
    notRecorded: "Not recorded",
    optional: "Optional",
    registered: "Registered",
    formHint: "Fill in the patient information below.",
    retry: "Retry",
  },
  bn: {
    code: "কোড",
    lastVisit: "সর্বশেষ ভিজিট",
    rxCount: "প্রেসক্রিপশন",
    newRx: "নতুন ℞",
    open: "খুলুন",
    viewAll: "সব দেখুন",
    noConsultations: "কোনো চিকিৎসা ইতিহাস নেই",
    duplicateConfirm: "এই প্রেসক্রিপশনের একটি অনুলিপি তৈরি করবেন?",
    duplicated: "প্রেসক্রিপশন অনুলিপি করা হয়েছে",
    notRecorded: "লেখা হয়নি",
    optional: "ঐচ্ছিক",
    registered: "নিবন্ধিত",
    formHint: "নিচে রোগীর তথ্য পূরণ করুন।",
    retry: "আবার চেষ্টা করুন",
  },
} as const;

export type PLKey = keyof typeof PL.en;

/** Pick a local label by current language. */
export function pl(key: PLKey, lang: Lang): string {
  return PL[lang][key];
}

/** Age string localized (Bengali digits + units when lang is bn). */
export function localAge(p: {
  ageYears?: number | null;
  ageMonths?: number | null;
  dob?: string | null;
}, lang: Lang): string {
  const s = formatPatientAge(p);
  if (!s) return "—";
  if (lang === "en") return s;
  return localizeDigits(
    s.replace("yrs", "বছর").replace("mo", "মাস").replace("y", "বছর").replace("m", "মাস"),
    lang
  );
}

/** Date string localized (Bengali calendar month names when lang is bn). */
export function localDate(d?: string | Date | null, lang: Lang = "en"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return date.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return localizeDigits(formatDate(date), lang);
  }
}

/** Gender label from the global DICT via the provided translate fn. */
export function genderText(
  gender: string,
  t: (k: "male" | "female" | "other") => string
): string {
  if (gender === "MALE") return t("male");
  if (gender === "FEMALE") return t("female");
  if (gender === "OTHER") return t("other");
  return gender || "—";
}

/** Prescription status label from the global DICT. */
export function statusLabel(
  status: string,
  t: (k: "draft" | "finalized") => string
): string {
  return status === "FINALIZED" ? t("finalized") : t("draft");
}

/** Tailwind classes for prescription status badges (emerald = finalized, amber = draft). */
export function statusBadgeClass(status: string): string {
  return status === "FINALIZED"
    ? "border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
    : "border-transparent bg-amber-100 text-amber-700 hover:bg-amber-100";
}

/** Reusable thin custom scrollbar utility (Tailwind arbitrary variants). */
export const THIN_SCROLL =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent";
