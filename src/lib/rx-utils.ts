// Shared helpers for prescription rendering & editing.

import type { MedicineLine } from "@/lib/types";

const FORM_ABBREV: [RegExp, string][] = [
  [/^tablet/i, "Tab."],
  [/^capsule \(delayed release\)/i, "Cap. (DR)"],
  [/^capsule \(timed release\)/i, "Cap. (TR)"],
  [/^capsule \(extended release\)/i, "Cap. (ER)"],
  [/^capsule \(sustained release\)/i, "Cap. (SR)"],
  [/^capsule/i, "Cap."],
  [/^powder for suspension/i, "Susp."],
  [/^oral suspension/i, "Susp."],
  [/^suspension/i, "Susp."],
  [/^syrup/i, "Syp."],
  [/^oral solution/i, "Sol."],
  [/^oral powder/i, "Powder"],
  [/^pediatric drops/i, "Ped. Drops"],
  [/^chewable tablet/i, "Chew. Tab."],
  [/^dispersible tablet/i, "Disp. Tab."],
  [/^tablet \(enteric coated\)/i, "Tab. (EC)"],
  [/^tablet \(extended release\)/i, "Tab. (ER)"],
  [/^tablet \(sustained release\)/i, "Tab. (SR)"],
  [/^tablet \(delayed release\)/i, "Tab. (DR)"],
  [/^tablet \(controlled release\)/i, "Tab. (CR)"],
  [/^tablet \(modified release\)/i, "Tab. (MR)"],
  [/^iv injection or infusion/i, "IV Infusion"],
  [/^iv infusion/i, "IV Infusion"],
  [/^iv injection/i, "IV Inj."],
  [/^im\/iv injection/i, "IM/IV Inj."],
  [/^iv\/sc injection/i, "IV/SC Inj."],
  [/^im injection/i, "IM Inj."],
  [/^sc injection/i, "SC Inj."],
  [/^injection/i, "Inj."],
  [/^ophthalmic solution/i, "Eye Drops"],
  [/^ophthalmic suspension/i, "Eye Drops"],
  [/^ophthalmic ointment/i, "Eye Oint."],
  [/^nasal spray/i, "Nasal Spray"],
  [/^nasal drop/i, "Nasal Drops"],
  [/^inhalation capsule/i, "Inhal. Cap."],
  [/^inhaler/i, "Inhaler"],
  [/^cream/i, "Cream"],
  [/^ointment/i, "Oint."],
  [/^gel/i, "Gel"],
  [/^lotion/i, "Lotion"],
  [/^suppository/i, "Supp."],
  [/^hand rub/i, "Hand Rub"],
];

export function abbreviateForm(form: string): string {
  if (!form) return "";
  for (const [re, abbr] of FORM_ABBREV) {
    if (re.test(form.trim())) return abbr;
  }
  return form;
}

// A formatted single-line medicine e.g. "Tab. NAPA 500 mg — 1+0+1 — খাবারের পরে — ৫ দিন"
export function formatMedicineLine(m: MedicineLine): string {
  if (m.customText.trim()) return m.customText.trim();
  const parts: string[] = [];
  const prefix = abbreviateForm(m.dosageForm);
  const name = [prefix, m.brandName].filter(Boolean).join(" ");
  const nameStrength = [name, m.strength].filter(Boolean).join(" ");
  parts.push(nameStrength);
  const doseFreq = [m.dose, m.frequency].filter(Boolean).join(" ");
  if (doseFreq) parts.push(doseFreq);
  if (m.mealTiming) parts.push(m.mealTiming);
  if (m.duration) parts.push(m.duration);
  return parts.join("  —  ");
}

export function calcBMI(weightKg?: string, heightCm?: string): string {
  const w = parseFloat(weightKg || "");
  const h = parseFloat(heightCm || "");
  if (!w || !h || h <= 0) return "";
  const bmi = w / Math.pow(h / 100, 2);
  return bmi.toFixed(1);
}

export function formatPatientAge(p: { ageYears?: number | null; ageMonths?: number | null; dob?: string | null }): string {
  if (p.dob) {
    const d = new Date(p.dob);
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
    return `${years} yrs`;
  }
  if (p.ageYears && p.ageMonths) return `${p.ageYears}y ${p.ageMonths}m`;
  if (p.ageYears) return `${p.ageYears} yrs`;
  if (p.ageMonths) return `${p.ageMonths} mo`;
  return "";
}

export function formatDate(d?: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function parseJSONSafe<T>(s: string, fallback: T): T {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
