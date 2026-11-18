// Permissions an assistant can be given by the doctor they work for. Doctors implicitly have all of
// them (for their own clinic); finalizing / signing prescriptions is NEVER delegable.

export interface PermissionDef {
  key: string;
  default: boolean;
  en: string;
  bn: string;
  hint: { en: string; bn: string };
}

export const ASSISTANT_PERMISSIONS: PermissionDef[] = [
  {
    key: "patients.view",
    default: true,
    en: "View patient records",
    bn: "রোগীর রেকর্ড দেখা",
    hint: { en: "The doctor's own patient register", bn: "ডাক্তারের নিজস্ব রোগী তালিকা" },
  },
  {
    key: "patients.register",
    default: true,
    en: "Register / edit patients",
    bn: "রোগী নিবন্ধন ও সম্পাদনা",
    hint: { en: "Create and update patient records (data entry)", bn: "নতুন রোগী যোগ ও তথ্য আপডেট" },
  },
  {
    key: "documents.upload",
    default: true,
    en: "Upload patient documents",
    bn: "রোগীর ডকুমেন্ট আপলোড",
    hint: { en: "Reports, images", bn: "রিপোর্ট, ছবি" },
  },
  {
    key: "prescriptions.view",
    default: true,
    en: "View prescriptions",
    bn: "প্রেসক্রিপশন দেখা",
    hint: { en: "Read-only", bn: "শুধু দেখা" },
  },
  {
    key: "consultation.dataentry",
    default: false,
    en: "Consultation data entry",
    bn: "কনসাল্টেশন ডেটা এন্ট্রি",
    hint: { en: "Create / edit DRAFT prescriptions (cannot finalize or sign)", bn: "ড্রাফট প্রেসক্রিপশন তৈরি/সম্পাদনা (ফাইনালাইজ বা সই নয়)" },
  },
  {
    key: "appointments.manage",
    default: true,
    en: "Manage appointments",
    bn: "অ্যাপয়েন্টমেন্ট পরিচালনা",
    hint: { en: "Confirm / decline / schedule requests", bn: "অনুরোধ নিশ্চিত/বাতিল/সময় নির্ধারণ" },
  },
  {
    key: "patientAccounts.search",
    default: false,
    en: "Search patient accounts",
    bn: "রোগীর অ্যাকাউন্ট খোঁজা",
    hint: { en: "Find self-registered patients by UID and request access", bn: "UID দিয়ে রোগী খুঁজে অ্যাক্সেস চাওয়া" },
  },
  {
    key: "patientAccounts.medical",
    default: false,
    en: "View consented medical information",
    bn: "অনুমোদিত মেডিকেল তথ্য দেখা",
    hint: { en: "Only where the patient has consented to this doctor", bn: "শুধু যেখানে রোগী এই ডাক্তারকে অনুমতি দিয়েছেন" },
  },
];

export const ASSISTANT_PERMISSION_KEYS = ASSISTANT_PERMISSIONS.map((p) => p.key);
export const DEFAULT_ASSISTANT_PERMISSIONS = ASSISTANT_PERMISSIONS.filter((p) => p.default).map((p) => p.key);

export const PASSWORD_RULES_TEXT = {
  en: "At least 8 characters, with letters and digits",
  bn: "কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা মিলিয়ে",
};

/** null = OK, otherwise the reason (English; shown in the UI as-is). */
export function passwordProblem(pw: string, ctx: { username?: string; email?: string } = {}): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain both letters and digits";
  const lower = pw.toLowerCase();
  if (ctx.username && lower.includes(ctx.username.toLowerCase())) return "Password must not contain the username";
  if (ctx.email && ctx.email.includes("@") && lower === ctx.email.toLowerCase()) return "Password must not be the email address";
  return null;
}

export function randomTempPassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = letters + digits;
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = letters[bytes[0] % letters.length] + digits[bytes[1] % digits.length];
  for (let i = 2; i < 12; i++) out += all[bytes[i] % all.length];
  return out;
}
