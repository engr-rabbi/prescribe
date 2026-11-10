// Selectable option constants — the click-to-select source lists for the
// prescription editor (frequency, duration, meal timing, routes, etc.)

export const FREQUENCY_OPTIONS = [
  { value: "1+0+0", label: "1+0+0 (Morning)", labelBn: "১+০+০ (সকাল)" },
  { value: "0+0+1", label: "0+0+1 (Night)", labelBn: "০+০+১ (রাত)" },
  { value: "1+0+1", label: "1+0+1 (Morning & Night)", labelBn: "১+০+১ (সকাল ও রাত)" },
  { value: "0+1+0", label: "0+1+0 (Noon)", labelBn: "০+১+০ (দুপুর)" },
  { value: "1+1+1", label: "1+1+1 (Three times)", labelBn: "১+১+১ (দিনে তিনবার)" },
  { value: "1+1+0", label: "1+1+0 (Morning & Noon)", labelBn: "১+১+০ (সকাল ও দুপুর)" },
  { value: "0+1+1", label: "0+1+1 (Noon & Night)", labelBn: "০+১+১ (দুপুর ও রাত)" },
  { value: "1/2+0+0", label: "½+0+0 (Half morning)", labelBn: "½+০+০ (সকালে আধা)" },
  { value: "0+0+1/2", label: "0+0+½ (Half night)", labelBn: "০+০+½ (রাতে আধা)" },
  { value: "1/2+1/2+1/2", label: "½+½+½ (Half three times)", labelBn: "½+½+½" },
  { value: "2+2+2", label: "2+2+2 (Two twice...)", labelBn: "২+২+২" },
  { value: "1+1+1+1", label: "1+1+1+1 (Four times)", labelBn: "১+১+১+১ (দিনে চারবার)" },
  { value: "Once daily", label: "Once Daily", labelBn: "দিনে একবার" },
  { value: "Twice daily", label: "Twice Daily", labelBn: "দিনে দুইবার" },
  { value: "Three times daily", label: "Three Times Daily", labelBn: "দিনে তিনবার" },
  { value: "Four times daily", label: "Four Times Daily", labelBn: "দিনে চারবার" },
  { value: "Every 6 hours", label: "Every 6 Hours", labelBn: "প্রতি ৬ ঘণ্টায়" },
  { value: "Every 8 hours", label: "Every 8 Hours", labelBn: "প্রতি ৮ ঘণ্টায়" },
  { value: "Every 12 hours", label: "Every 12 Hours", labelBn: "প্রতি ১২ ঘণ্টায়" },
  { value: "Alternate day", label: "Alternate Day", labelBn: "একদিন অন্তর" },
  { value: "Once weekly", label: "Once Weekly", labelBn: "সপ্তাহে একবার" },
  { value: "SOS", label: "As Required (SOS)", labelBn: "প্রয়োজনে" },
  { value: "Stat", label: "Immediately (Stat)", labelBn: "তৎক্ষণাৎ" },
  { value: "As directed", label: "As Directed", labelBn: "ডাক্তারের পরামর্শ অনুযায়ী" },
  { value: "Before sleep", label: "Before Sleep", labelBn: "ঘুমানোর আগে" },
  { value: "At bedtime", label: "At Bedtime", labelBn: "রাতে ঘুমানোর সময়" },
];

export const MEAL_TIMING_OPTIONS = [
  { value: "Before meal", label: "Before Meal", labelBn: "খাবারের আগে" },
  { value: "After meal", label: "After Meal", labelBn: "খাবারের পরে" },
  { value: "With meal", label: "With Meal", labelBn: "খাবারের সাথে" },
  { value: "Empty stomach", label: "Empty Stomach", labelBn: "খালি পেটে" },
  { value: "30 min before meal", label: "30 min Before Meal", labelBn: "খাবারের ৩০ মিনিট আগে" },
  { value: "At bedtime", label: "At Bedtime", labelBn: "রাতে ঘুমানোর সময়" },
  { value: "Anytime", label: "Anytime", labelBn: "যেকোনো সময়" },
];

export const DURATION_OPTIONS = [
  { value: "1 day", label: "1 Day", labelBn: "১ দিন" },
  { value: "2 days", label: "2 Days", labelBn: "২ দিন" },
  { value: "3 days", label: "3 Days", labelBn: "৩ দিন" },
  { value: "5 days", label: "5 Days", labelBn: "৫ দিন" },
  { value: "7 days", label: "7 Days", labelBn: "৭ দিন" },
  { value: "10 days", label: "10 Days", labelBn: "১০ দিন" },
  { value: "14 days", label: "14 Days", labelBn: "১৪ দিন" },
  { value: "15 days", label: "15 Days", labelBn: "১৫ দিন" },
  { value: "21 days", label: "21 Days", labelBn: "২১ দিন" },
  { value: "1 month", label: "1 Month", labelBn: "১ মাস" },
  { value: "2 months", label: "2 Months", labelBn: "২ মাস" },
  { value: "3 months", label: "3 Months", labelBn: "৩ মাস" },
  { value: "6 months", label: "6 Months", labelBn: "৬ মাস" },
  { value: "Continue", label: "Continue", labelBn: "চলবে" },
  { value: "SOS", label: "As Required", labelBn: "প্রয়োজনে" },
];

export const ROUTE_OPTIONS = [
  { value: "Oral", label: "Oral", labelBn: "মুখে" },
  { value: "IV", label: "Intravenous (IV)", labelBn: "শিরায়" },
  { value: "IM", label: "Intramuscular (IM)", labelBn: "পেশিতে" },
  { value: "SC", label: "Subcutaneous (SC)", labelBn: "চামড়ার নিচে" },
  { value: "Topical", label: "Topical", labelBn: "ত্বকে বাইরে" },
  { value: "Inhalation", label: "Inhalation", labelBn: "শ্বাসের সাথে" },
  { value: "Rectal", label: "Rectal", labelBn: "মলদ্বারে" },
  { value: "Ophthalmic", label: "Ophthalmic (Eye)", labelBn: "চোখে" },
  { value: "Nasal", label: "Nasal (Nose)", labelBn: "নাকে" },
  { value: "Otic", label: "Otic (Ear)", labelBn: "কানে" },
  { value: "Sublingual", label: "Sublingual", labelBn: "জিভার নিচে" },
];

export const DOSE_OPTIONS = [
  "1 tab", "2 tab", "½ tab", "1 cap", "2 cap", "1 spoon", "2 spoon",
  "1 tsp", "2 tsp", "5 ml", "10 ml", "1 puff", "2 drops", "1 drop",
  "1 sachet", "1 amp", "1 vial", "1 suppository", "Apply thin layer", "As directed",
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const SPECIALIZATIONS = [
  "Medicine", "Cardiology", "Dermatology & Venereology", "Diabetology",
  "Endocrinology", "ENT (Otolaryngology)", "Gastroenterology", "General Surgery",
  "Gynecology & Obstetrics", "Hepatology", "Kidney Disease (Nephrology)",
  "Medicine & Kidney Disease", "Neurology", "Neuromedicine", "Oncology",
  "Ophthalmology", "Orthopedics", "Pediatrics", "Physical Medicine & Rehabilitation",
  "Psychiatry", "Pulmonology (Chest)", "Rheumatology", "Urology", "Dentistry",
];

export const FREQUENCY_BN_HINT: Record<string, string> = {
  "1+0+0": "সকালে ১টি",
  "0+1+0": "দুপুরে ১টি",
  "0+0+1": "রাতে ১টি",
  "1+0+1": "সকালে ১টি, রাতে ১টি",
  "1+1+1": "দিনে ৩ বার ১টি",
};

export const TEMPLATE_META = [
  {
    key: "modern",
    name: "Modern Professional",
    nameBn: "আধুনিক পেশাদার",
    description: "Clean centered header with balanced two-column body — best for daily practice.",
  },
  {
    key: "clinical",
    name: "Clinical Detailed",
    nameBn: "ক্লিনিকাল বিস্তারিত",
    description: "Structured sections with vitals grid — best for detailed clinical documentation.",
  },
  {
    key: "classic",
    name: "Classic Medical",
    nameBn: "ক্লাসিক মেডিকেল",
    description: "Traditional Rx pad layout with serif typography — familiar paper-style look.",
  },
] as const;

export const ACCENT_COLORS = [
  { name: "teal", value: "#0f766e" },
  { name: "green", value: "#15803d" },
  { name: "maroon", value: "#9f1239" },
  { name: "navy", value: "#1e3a5f" },
  { name: "purple", value: "#6d28d9" },
  { name: "black", value: "#1c1917" },
];
