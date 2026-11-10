"use client";

// Doctor profile form — personal/professional info, chamber & schedule,
// prescription branding (photo / signature / logo) and password change.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  ImagePlus,
  KeyRound,
  Loader2,
  Save,
  Stethoscope,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { SPECIALIZATIONS } from "@/lib/constants";
import { ChamberManager } from "@/components/profile/chamber-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface DoctorProfileFormProps {
  className?: string;
}

// Local EN/BN labels for strings missing from the shared i18n DICT.
type LMap = { en: string; bn: string };

const L: Record<string, LMap> = {
  personalSection: { en: "Personal & Professional", bn: "ব্যক্তিগত ও পেশাগত" },
  personalDesc: {
    en: "Shown on every prescription header and report.",
    bn: "প্রতিটি প্রেসক্রিপশনের হেডার ও রিপোর্টে দেখানো হয়।",
  },
  chamberSection: { en: "Chamber & Schedule", bn: "চেম্বার ও সময়সূচি" },
  chamberDesc: {
    en: "Default chamber address, consultation hours and header/footer notes.",
    bn: "ডিফল্ট চেম্বারের ঠিকানা, পরামর্শের সময় এবং হেডার/ফুটার নোট।",
  },
  brandingSection: { en: "Prescription Branding", bn: "প্রেসক্রিপশন ব্র্যান্ডিং" },
  brandingDesc: {
    en: "Photo, signature and chamber logo printed on the prescription.",
    bn: "প্রেসক্রিপশনে ছাপার ছবি, স্বাক্ষর ও চেম্বার লোগো।",
  },
  passwordSection: { en: "Change Password", bn: "পাসওয়ার্ড পরিবর্তন" },
  passwordDesc: {
    en: "Use a strong password of at least 6 characters.",
    bn: "কমপক্ষে ৬ অক্ষরের শক্তিশালী পাসওয়ার্ড ব্যবহার করুন।",
  },
  currentPassword: { en: "Current Password", bn: "বর্তমান পাসওয়ার্ড" },
  newPassword: { en: "New Password", bn: "নতুন পাসওয়ার্ড" },
  confirmPassword: { en: "Confirm New Password", bn: "নতুন পাসওয়ার্ড নিশ্চিত করুন" },
  selectSpec: { en: "Select specialization…", bn: "বিশেষত্ব নির্বাচন করুন…" },
  otherOption: { en: "Other (specify)…", bn: "অন্যান্য (লিখুন)…" },
  saving: { en: "Saving…", bn: "সংরক্ষণ হচ্ছে…" },
  updating: { en: "Updating…", bn: "হালনাগাদ হচ্ছে…" },
  loadingProfile: { en: "Loading profile…", bn: "প্রোফাইল লোড হচ্ছে…" },
  fileSizeWarn: {
    en: "Image is larger than 300 KB — it was accepted, but may slow down printing.",
    bn: "ছবিটি ৩০০ কিলোবাইটের বেশি — গৃহীত হয়েছে, তবে প্রিন্টে ধীরগতি হতে পারে।",
  },
  notImage: { en: "Please choose an image file.", bn: "অনুগ্রহ করে একটি ছবি নির্বাচন করুন।" },
  pwRequired: { en: "Please fill in all password fields.", bn: "সব পাসওয়ার্ড ঘর পূরণ করুন।" },
  pwShort: {
    en: "New password must be at least 6 characters.",
    bn: "নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
  },
  pwMismatch: { en: "New passwords do not match.", bn: "নতুন পাসওয়ার্ড দুটি মেলেনি।" },
  pwChanged: { en: "Password changed successfully.", bn: "পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে।" },
};

const CUSTOM_SPEC = "__custom__";
const NO_SPEC = "__none__";

interface FormState {
  fullName: string;
  professionalTitle: string;
  bmdcNo: string;
  designation: string;
  hospitalName: string;
  phone: string;
  email: string;
  chamberAddress: string;
  consultationSchedule: string;
  headerNote: string;
  footerNote: string;
  photoUrl: string;
  signatureUrl: string;
  logoUrl: string;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  professionalTitle: "",
  bmdcNo: "",
  designation: "",
  hospitalName: "",
  phone: "",
  email: "",
  chamberAddress: "",
  consultationSchedule: "",
  headerNote: "",
  footerNote: "",
  photoUrl: "",
  signatureUrl: "",
  logoUrl: "",
};

// Max 300 KB per branding image (soft limit — larger images still accepted with a warning).
const IMAGE_SOFT_LIMIT = 300 * 1024;

function ImageField({
  label,
  uploadLabel,
  removeLabel,
  value,
  onChange,
  onFile,
}: {
  label: string;
  uploadLabel: string;
  removeLabel: string;
  value: string;
  onChange: (v: string) => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-full flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/30 px-2">
          {value ? (
            <img src={value} alt={label} className="max-h-20 w-auto max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImagePlus className="size-4" />
              —
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            {uploadLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!value}
            onClick={() => onChange("")}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {removeLabel}
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function DoctorProfileForm({ className }: DoctorProfileFormProps) {
  const { lang, t } = useI18n();
  const s = useCallback((m: LMap) => m[lang], [lang]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Specialization select state (list value / custom / none)
  const [specChoice, setSpecChoice] = useState<string>(NO_SPEC);
  const [specCustom, setSpecCustom] = useState("");

  // Change-password state
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Load profile on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { profile } = await api.getDoctorProfile();
        if (cancelled) return;
        setForm({
          fullName: profile.fullName ?? "",
          professionalTitle: profile.professionalTitle ?? "",
          bmdcNo: profile.bmdcNo ?? "",
          designation: profile.designation ?? "",
          hospitalName: profile.hospitalName ?? "",
          phone: profile.phone ?? "",
          email: profile.email ?? "",
          chamberAddress: profile.chamberAddress ?? "",
          consultationSchedule: profile.consultationSchedule ?? "",
          headerNote: profile.headerNote ?? "",
          footerNote: profile.footerNote ?? "",
          photoUrl: profile.photoUrl ?? "",
          signatureUrl: profile.signatureUrl ?? "",
          logoUrl: profile.logoUrl ?? "",
        });
        const current = profile.specialization ?? "";
        if (!current) {
          setSpecChoice(NO_SPEC);
        } else if (SPECIALIZATIONS.includes(current)) {
          setSpecChoice(current);
        } else {
          setSpecChoice(CUSTOM_SPEC);
          setSpecCustom(current);
        }
      } catch {
        toast.error(t("error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Read an image file into a base64 data URL (with >300 KB soft warning).
  const handleImageFile = useCallback(
    (file: File, apply: (dataUrl: string) => void) => {
      if (!file.type.startsWith("image/")) {
        toast.error(s(L.notImage));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          toast.error(t("error"));
          return;
        }
        if (file.size > IMAGE_SOFT_LIMIT) toast.warning(s(L.fileSizeWarn));
        apply(dataUrl);
      };
      reader.onerror = () => toast.error(t("error"));
      reader.readAsDataURL(file);
    },
    [s, t]
  );

  async function handleSave() {
    if (saving) return;
    if (!form.fullName.trim()) {
      toast.error(t("required"));
      return;
    }
    const specialization =
      specChoice === CUSTOM_SPEC
        ? specCustom.trim()
        : specChoice === NO_SPEC
          ? ""
          : specChoice;
    setSaving(true);
    try {
      await api.updateDoctorProfile({
        fullName: form.fullName.trim(),
        professionalTitle: form.professionalTitle.trim(),
        specialization,
        bmdcNo: form.bmdcNo.trim(),
        designation: form.designation.trim(),
        hospitalName: form.hospitalName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        chamberAddress: form.chamberAddress,
        consultationSchedule: form.consultationSchedule,
        headerNote: form.headerNote,
        footerNote: form.footerNote,
        photoUrl: form.photoUrl,
        signatureUrl: form.signatureUrl,
        logoUrl: form.logoUrl,
      });
      toast.success(t("profileSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (pwBusy) return;
    if (!pw.current || !pw.next || !pw.confirm) {
      toast.error(s(L.pwRequired));
      return;
    }
    if (pw.next.length < 6) {
      toast.error(s(L.pwShort));
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error(s(L.pwMismatch));
      return;
    }
    setPwBusy(true);
    try {
      await api.changePassword(pw.current, pw.next);
      toast.success(s(L.pwChanged));
      setPw({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-24 text-muted-foreground", className)}>
        <Loader2 className="mr-2 size-5 animate-spin text-teal-700" />
        {s(L.loadingProfile)}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-6 lg:grid-cols-2 [&>*]:min-w-0", className)}>
      {/* ---------- a) Personal & Professional ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-teal-700 dark:text-teal-400" />
            {s(L.personalSection)}
          </CardTitle>
          <CardDescription>{s(L.personalDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-fullName">{t("fullName")}</Label>
            <Input
              id="pf-fullName"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              placeholder="Dr. …"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-title">{t("professionalTitle")}</Label>
            <Input
              id="pf-title"
              value={form.professionalTitle}
              onChange={(e) => set("professionalTitle", e.target.value)}
              placeholder="MBBS, FCPS …"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-bmdc">{t("bmdcNo")}</Label>
            <Input
              id="pf-bmdc"
              value={form.bmdcNo}
              onChange={(e) => set("bmdcNo", e.target.value)}
              placeholder="A-XXXXX"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-spec">{t("specializationField")}</Label>
            <Select value={specChoice} onValueChange={setSpecChoice}>
              <SelectTrigger id="pf-spec" className="w-full">
                <SelectValue placeholder={s(L.selectSpec)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SPEC}>{s(L.selectSpec)}</SelectItem>
                {SPECIALIZATIONS.map((sp) => (
                  <SelectItem key={sp} value={sp}>
                    {sp}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_SPEC}>{s(L.otherOption)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-designation">{t("designation")}</Label>
            <Input
              id="pf-designation"
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="Professor, Associate Professor …"
            />
          </div>
          {specChoice === CUSTOM_SPEC && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="pf-spec-custom">{t("specializationField")}</Label>
              <Input
                id="pf-spec-custom"
                value={specCustom}
                onChange={(e) => setSpecCustom(e.target.value)}
                placeholder="e.g. Sports Medicine"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pf-hospital">{t("hospitalName")}</Label>
            <Input
              id="pf-hospital"
              value={form.hospitalName}
              onChange={(e) => set("hospitalName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-phone">{t("phone")}</Label>
            <Input
              id="pf-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+880 …"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-email">{t("email")}</Label>
            <Input
              id="pf-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ---------- b) Chamber & Schedule ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-teal-700 dark:text-teal-400" />
            {s(L.chamberSection)}
          </CardTitle>
          <CardDescription>{s(L.chamberDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pf-chamber">{t("chamberAddress")}</Label>
            <Textarea
              id="pf-chamber"
              rows={3}
              value={form.chamberAddress}
              onChange={(e) => set("chamberAddress", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-schedule">{t("consultationSchedule")}</Label>
            <Textarea
              id="pf-schedule"
              rows={3}
              value={form.consultationSchedule}
              onChange={(e) => set("consultationSchedule", e.target.value)}
              placeholder="Sat–Thu, 5:00 PM – 9:00 PM (Fri closed)"
            />
          </div>
          <Separator />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pf-header">{t("headerNote")}</Label>
              <Input
                id="pf-header"
                value={form.headerNote}
                onChange={(e) => set("headerNote", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-footer">{t("footerNote")}</Label>
              <Input
                id="pf-footer"
                value={form.footerNote}
                onChange={(e) => set("footerNote", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------- b2) Chambers & Schedules (multiple chamber profiles) ---------- */}
      <ChamberManager className="lg:col-span-2" />

      {/* ---------- c) Prescription Branding ---------- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="size-4 text-teal-700 dark:text-teal-400" />
            {s(L.brandingSection)}
          </CardTitle>
          <CardDescription>{s(L.brandingDesc)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <ImageField
            label={t("photo")}
            uploadLabel={t("upload")}
            removeLabel={t("remove")}
            value={form.photoUrl}
            onChange={(v) => set("photoUrl", v)}
            onFile={(file) => handleImageFile(file, (d) => set("photoUrl", d))}
          />
          <ImageField
            label={t("signature")}
            uploadLabel={t("upload")}
            removeLabel={t("remove")}
            value={form.signatureUrl}
            onChange={(v) => set("signatureUrl", v)}
            onFile={(file) => handleImageFile(file, (d) => set("signatureUrl", d))}
          />
          <ImageField
            label={t("logo")}
            uploadLabel={t("upload")}
            removeLabel={t("remove")}
            value={form.logoUrl}
            onChange={(v) => set("logoUrl", v)}
            onFile={(file) => handleImageFile(file, (d) => set("logoUrl", d))}
          />
        </CardContent>
      </Card>

      {/* ---------- Save bar ---------- */}
      <div className="flex justify-end lg:col-span-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-teal-700 to-emerald-600 text-white hover:from-teal-800 hover:to-emerald-700"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {s(L.saving)}
            </>
          ) : (
            <>
              <Save className="size-4" />
              {t("save")}
            </>
          )}
        </Button>
      </div>

      {/* ---------- Change Password ---------- */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-teal-700 dark:text-teal-400" />
            {s(L.passwordSection)}
          </CardTitle>
          <CardDescription>{s(L.passwordDesc)}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pw-current">{s(L.currentPassword)}</Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-next">{s(L.newPassword)}</Label>
              <Input
                id="pw-next"
                type="password"
                autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-confirm">{s(L.confirmPassword)}</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={handleChangePassword} disabled={pwBusy}>
              {pwBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {s(L.updating)}
                </>
              ) : (
                <>
                  <KeyRound className="size-4" />
                  {s(L.passwordSection)}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default DoctorProfileForm;
