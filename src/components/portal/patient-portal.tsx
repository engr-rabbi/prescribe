"use client";

// The patient's own account: profile & medical information (each item with its last-updated date), appointment
// requests, published prescriptions (+PDF), medical reports, consent to doctors, and the doctors' forms.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Copy, Download, Eye, FileText, Loader2, Plus, ShieldCheck, ShieldOff, Trash2, Upload, X } from "lucide-react";

import { api, blobToBase64, openStoredFile, type FileDTO, type PatientProfile } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { AccessDTO, AppointmentDTO, DirectoryDoctor, PatientFormDTO } from "@/lib/portal-types";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type LMap = { en: string; bn: string };
const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Failed");

function Page({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {desc ? <p className="mt-1 text-sm text-slate-500">{desc}</p> : null}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

const FIELDS: { key: keyof PatientProfile; label: LMap; kind?: "text" | "textarea" | "number" | "date" | "select"; options?: string[] }[] = [
  { key: "fullName", label: { en: "Full name", bn: "পূর্ণ নাম" } },
  { key: "dob", label: { en: "Date of birth", bn: "জন্মতারিখ" }, kind: "date" },
  { key: "gender", label: { en: "Gender", bn: "লিঙ্গ" }, kind: "select", options: ["Male", "Female", "Other"] },
  { key: "mobile", label: { en: "Mobile number", bn: "মোবাইল নম্বর" } },
  { key: "email", label: { en: "Email address", bn: "ইমেইল" } },
  { key: "address", label: { en: "Address", bn: "ঠিকানা" }, kind: "textarea" },
  { key: "weight", label: { en: "Weight (kg)", bn: "ওজন (কেজি)" }, kind: "number" },
  { key: "height", label: { en: "Height (cm)", bn: "উচ্চতা (সেমি)" }, kind: "number" },
  { key: "bloodGroup", label: { en: "Blood group", bn: "রক্তের গ্রুপ" }, kind: "select", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  { key: "allergies", label: { en: "Known allergies", bn: "পরিচিত অ্যালার্জি" }, kind: "textarea" },
  { key: "conditions", label: { en: "Existing medical conditions", bn: "বিদ্যমান রোগ" }, kind: "textarea" },
  { key: "history", label: { en: "Previous medical history", bn: "পূর্বের চিকিৎসা ইতিহাস" }, kind: "textarea" },
  { key: "medications", label: { en: "Current medication", bn: "চলমান ওষুধ" }, kind: "textarea" },
  { key: "surgeries", label: { en: "Previous surgery", bn: "পূর্বের অস্ত্রোপচার" }, kind: "textarea" },
  { key: "familyHistory", label: { en: "Family medical history", bn: "পারিবারিক চিকিৎসা ইতিহাস" }, kind: "textarea" },
  { key: "other", label: { en: "Other relevant information", bn: "অন্যান্য প্রয়োজনীয় তথ্য" }, kind: "textarea" },
];

export function PatientProfileView() {
  const { lang } = useI18n();
  const user = useAppStore((s) => s.user);
  const [p, setP] = useState<PatientProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<{ id: string; label: string; value: string; updatedAt: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const apply = (profile: PatientProfile) => {
    setP(profile);
    const f: Record<string, string> = {};
    for (const x of FIELDS) {
      const v = profile[x.key];
      f[x.key] = v === null || v === undefined ? "" : x.key === "dob" ? String(v).slice(0, 10) : String(v);
    }
    setForm(f);
    setCustom(profile.customFields);
  };
  useEffect(() => {
    api.myProfile().then((r) => apply(r.profile)).catch((e) => toast.error(errMsg(e)));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const x of FIELDS) {
        const v = form[x.key];
        if (x.kind === "number") body[x.key] = v === "" ? null : Number(v);
        else if (x.key === "dob") body.dob = v || null;
        else body[x.key] = v;
      }
      body.customFields = custom.filter((c) => c.label.trim()).map((c) => ({ id: c.id, label: c.label, value: c.value }));
      apply((await api.updateMyProfile(body)).profile);
      toast.success(lang === "bn" ? "প্রোফাইল সংরক্ষিত হয়েছে" : "Profile saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!p) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-slate-400" />;
  return (
    <Page title={lang === "bn" ? "আমার প্রোফাইল ও মেডিকেল তথ্য" : "My profile & medical information"} desc={lang === "bn" ? "ডাক্তার আগে থেকে যা জানতে চান তা এখানে পূরণ করুন। প্রতিটি তথ্যের সর্বশেষ আপডেটের তারিখ সংরক্ষিত হয়।" : "Fill in what your doctor needs before the visit. The date of every change is kept."}>
      <Card className="border-teal-200 bg-teal-50/60 shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-xs font-medium text-teal-800">{lang === "bn" ? "আপনার পেশেন্ট UID (স্থায়ী)" : "Your Patient UID (permanent)"}</p>
            <p className="font-mono text-2xl font-semibold tracking-wide text-teal-900">{user?.patientUid}</p>
          </div>
          <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(user?.patientUid ?? "").then(() => toast.success(lang === "bn" ? "কপি হয়েছে" : "Copied"))}>
            <Copy className="size-4" />
            {lang === "bn" ? "কপি" : "Copy"}
          </Button>
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          {FIELDS.map((x) => (
            <div key={x.key} className={`space-y-1.5 ${x.kind === "textarea" ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={`pf-${x.key}`} className="flex items-baseline justify-between gap-2">
                <span>{x.label[lang]}</span>
                <span className="text-[11px] font-normal text-slate-400">{lang === "bn" ? "আপডেট" : "updated"} {date(p.fieldUpdated[x.key])}</span>
              </Label>
              {x.kind === "textarea" ? (
                <Textarea id={`pf-${x.key}`} rows={2} value={form[x.key] ?? ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
              ) : x.kind === "select" ? (
                <Select value={form[x.key] || undefined} onValueChange={(v) => setForm({ ...form, [x.key]: v })}>
                  <SelectTrigger id={`pf-${x.key}`}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {x.options!.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id={`pf-${x.key}`} type={x.kind === "number" ? "number" : x.kind === "date" ? "date" : "text"} value={form[x.key] ?? ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{lang === "bn" ? "অতিরিক্ত তথ্য" : "Additional fields"}</CardTitle>
          <CardDescription>{lang === "bn" ? "নিজের প্রয়োজনমতো যেকোনো তথ্য যোগ করুন।" : "Add anything else you want your doctor to know."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {custom.map((c, i) => (
            <div key={c.id || i} className="flex flex-wrap items-center gap-2">
              <Input className="w-[200px]" placeholder={lang === "bn" ? "শিরোনাম" : "Label"} value={c.label} onChange={(e) => setCustom(custom.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
              <Input className="min-w-[220px] flex-1" placeholder={lang === "bn" ? "মান" : "Value"} value={c.value} onChange={(e) => setCustom(custom.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
              <span className="text-[11px] text-slate-400">{date(c.updatedAt)}</span>
              <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setCustom(custom.filter((_, k) => k !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCustom([...custom, { id: "", label: "", value: "", updatedAt: "" }])}>
            <Plus className="size-4" />
            {lang === "bn" ? "ঘর যোগ করুন" : "Add field"}
          </Button>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={busy} className="bg-teal-600 text-white hover:bg-teal-700">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {lang === "bn" ? "সংরক্ষণ করুন" : "Save"}
        </Button>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// appointments
// ---------------------------------------------------------------------------

const AP_STATUS: Record<string, { en: string; bn: string; cls: string }> = {
  REQUESTED: { en: "Requested", bn: "অনুরোধ পাঠানো", cls: "border-amber-200 bg-amber-100 text-amber-800" },
  CONFIRMED: { en: "Confirmed", bn: "নিশ্চিত", cls: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  DECLINED: { en: "Declined", bn: "বাতিল", cls: "border-rose-200 bg-rose-100 text-rose-800" },
  CANCELLED: { en: "Cancelled", bn: "বাতিল (আপনি)", cls: "border-slate-200 bg-slate-100 text-slate-600" },
  COMPLETED: { en: "Completed", bn: "সম্পন্ন", cls: "border-sky-200 bg-sky-100 text-sky-800" },
};

export function PatientAppointmentsView() {
  const { lang } = useI18n();
  const [docs, setDocs] = useState<DirectoryDoctor[]>([]);
  const [list, setList] = useState<AppointmentDTO[]>([]);
  const [f, setF] = useState({ doctorId: "", chamberId: "", preferredDate: "", preferredTime: "", reason: "", shareMedical: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([api.doctorDirectory(), api.myAppointments()]);
      setDocs(d.doctors);
      setList(a.appointments);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const doc = docs.find((d) => d.id === f.doctorId);
  const submit = async () => {
    setBusy(true);
    try {
      await api.requestAppointment({ doctorId: f.doctorId, chamberId: f.chamberId || null, preferredDate: f.preferredDate, preferredTime: f.preferredTime, reason: f.reason, shareMedical: f.shareMedical });
      toast.success(lang === "bn" ? "অনুরোধ পাঠানো হয়েছে" : "Request sent");
      setF({ ...f, reason: "", preferredDate: "", preferredTime: "" });
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={lang === "bn" ? "অ্যাপয়েন্টমেন্ট" : "Appointments"}>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="size-4 text-teal-600" />
            {lang === "bn" ? "ডাক্তারের কাছে অ্যাপয়েন্টমেন্ট চান" : "Request an appointment"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{lang === "bn" ? "ডাক্তার" : "Doctor"}</Label>
            <Select value={f.doctorId || undefined} onValueChange={(v) => setF({ ...f, doctorId: v, chamberId: "" })}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {docs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.specialization ? ` — ${d.specialization}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{lang === "bn" ? "চেম্বার" : "Chamber"}</Label>
            <Select value={f.chamberId || undefined} onValueChange={(v) => setF({ ...f, chamberId: v })} disabled={!doc?.chambers.length}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(doc?.chambers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.days ? `(${c.days}${c.time ? `, ${c.time}` : ""})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{lang === "bn" ? "পছন্দের তারিখ" : "Preferred date"}</Label>
            <Input type="date" value={f.preferredDate} onChange={(e) => setF({ ...f, preferredDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{lang === "bn" ? "পছন্দের সময়" : "Preferred time"}</Label>
            <Input type="time" value={f.preferredTime} onChange={(e) => setF({ ...f, preferredTime: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{lang === "bn" ? "কারণ" : "Reason"}</Label>
            <Textarea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={f.shareMedical} onChange={(e) => setF({ ...f, shareMedical: e.target.checked })} />
            <span>{lang === "bn" ? "এই ডাক্তারকে আমার মেডিকেল তথ্য দেখার অনুমতি দিন (পরে প্রত্যাহার করা যাবে)" : "Allow this doctor to see my medical information (you can withdraw this later)"}</span>
          </label>
          <div className="sm:col-span-2">
            <Button onClick={() => void submit()} disabled={busy || !f.doctorId || !f.preferredDate} className="bg-teal-600 text-white hover:bg-teal-700">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {lang === "bn" ? "অনুরোধ পাঠান" : "Send request"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ul className="space-y-2">
        {list.map((a) => {
          const st = AP_STATUS[a.status];
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{a.doctorName}</p>
                <p className="text-xs text-slate-500">
                  {a.preferredDate} {a.preferredTime}
                  {a.scheduledAt ? ` · ${lang === "bn" ? "নির্ধারিত" : "scheduled"} ${new Date(a.scheduledAt).toLocaleString()}` : ""}
                </p>
                {a.doctorNote ? <p className="mt-1 text-sm text-slate-700">{a.doctorNote}</p> : null}
              </div>
              <Badge className={st.cls}>{st[lang]}</Badge>
              {a.status === "REQUESTED" || a.status === "CONFIRMED" ? (
                <Button variant="outline" size="sm" onClick={() => void api.cancelAppointment(a.id).then(load).catch((e) => toast.error(errMsg(e)))}>
                  <X className="size-4" />
                  {lang === "bn" ? "বাতিল" : "Cancel"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// prescriptions
// ---------------------------------------------------------------------------

export function PatientPrescriptionsView() {
  const { lang } = useI18n();
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.myPrescriptions>>["prescriptions"] | null>(null);
  useEffect(() => {
    api.myPrescriptions().then((r) => setItems(r.prescriptions)).catch((e) => toast.error(errMsg(e)));
  }, []);
  if (!items) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-slate-400" />;
  return (
    <Page title={lang === "bn" ? "আমার প্রেসক্রিপশন" : "My prescriptions"} desc={lang === "bn" ? "শুধু ডাক্তারের প্রকাশিত (ফাইনাল) প্রেসক্রিপশন দেখা যায়।" : "Only prescriptions your doctor has finalized are shown."}>
      {items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{lang === "bn" ? "এখনো কোনো প্রেসক্রিপশন নেই।" : "No prescriptions yet."}</p> : null}
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium">{r.code}</span>
              <Badge variant="secondary" className="font-normal">
                v{r.version}
              </Badge>
              <span className="text-xs text-slate-500">
                {date(r.prescriptionDate)} · {r.doctor.fullName}
              </span>
              <div className="ml-auto flex gap-1">
                {r.pdfFileId ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void openStoredFile(r.pdfFileId!, "view").catch((e) => toast.error(errMsg(e)))}>
                      <Eye className="size-4" />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void openStoredFile(r.pdfFileId!, "download").catch((e) => toast.error(errMsg(e)))}>
                      <Download className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {r.diagnosis.length ? <p className="text-sm text-slate-700">{r.diagnosis.map((d) => d.label).join(", ")}</p> : null}
            <ul className="list-inside list-decimal text-sm text-slate-800">
              {r.medicines.map((m) => (
                <li key={m.id}>
                  {[m.dosageForm, m.brandName, m.strength].filter(Boolean).join(" ")} {m.frequency ? `— ${m.frequency}` : ""} {m.duration ? `· ${m.duration}` : ""}
                </li>
              ))}
            </ul>
            {r.followUpDate ? <p className="text-xs text-slate-500">{lang === "bn" ? "ফলো-আপ" : "Follow-up"}: {date(r.followUpDate)} {r.followUpNote}</p> : null}
          </li>
        ))}
      </ul>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// reports
// ---------------------------------------------------------------------------

const KINDS: { key: string; label: LMap }[] = [
  { key: "MEDICAL_REPORT", label: { en: "Medical report", bn: "মেডিকেল রিপোর্ট" } },
  { key: "LAB_REPORT", label: { en: "Lab / test report", bn: "ল্যাব / টেস্ট রিপোর্ট" } },
  { key: "XRAY", label: { en: "X-ray", bn: "এক্স-রে" } },
  { key: "CT_SCAN", label: { en: "CT scan", bn: "সিটি স্ক্যান" } },
  { key: "MRI", label: { en: "MRI", bn: "এমআরআই" } },
  { key: "ULTRASOUND", label: { en: "Ultrasound", bn: "আল্ট্রাসাউন্ড" } },
  { key: "OTHER_DOCUMENT", label: { en: "Other document", bn: "অন্যান্য" } },
];

export function PatientReportsView() {
  const { lang } = useI18n();
  const user = useAppStore((s) => s.user);
  const [files, setFiles] = useState<FileDTO[] | null>(null);
  const [kind, setKind] = useState("MEDICAL_REPORT");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const uid = user?.patientUid;
  const load = useCallback(async () => {
    if (!uid) return;
    try {
      setFiles((await api.listFiles("PATIENT_ACCOUNT", uid)).files);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [uid]);
  useEffect(() => {
    void load();
  }, [load]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    setBusy(true);
    try {
      for (const f of list) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name}: > 8 MB`);
          continue;
        }
        await api.uploadFile({ kind, relatedType: "PATIENT_ACCOUNT", relatedId: user?.patientUid ?? "", name: f.name, mimeType: f.type || "application/octet-stream", dataBase64: await blobToBase64(f) });
      }
      await load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={lang === "bn" ? "আমার মেডিকেল রিপোর্ট" : "My medical reports"} desc={lang === "bn" ? "আপনার আপলোড করা ফাইল Google Drive-এ সংরক্ষিত হয়। শুধু আপনি এবং আপনার সম্মতি পাওয়া ডাক্তার দেখতে পারেন।" : "Files you upload are stored in Google Drive. Only you — and doctors you have consented to — can see them."}>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-[200px]" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k.label[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input ref={input} type="file" multiple className="hidden" accept="image/*,application/pdf,.doc,.docx,.dcm" onChange={(e) => void onPick(e)} />
          <Button onClick={() => input.current?.click()} disabled={busy} className="bg-teal-600 text-white hover:bg-teal-700">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {lang === "bn" ? "আপলোড" : "Upload"}
          </Button>
        </CardContent>
      </Card>
      {!files ? <Loader2 className="size-5 animate-spin text-slate-400" /> : files.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{lang === "bn" ? "এখনো কোনো ফাইল নেই।" : "No files yet."}</p> : null}
      <ul className="space-y-2">
        {(files ?? []).map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <FileText className="size-5 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={f.name}>
                {f.name}
              </p>
              <p className="text-xs text-slate-500">{new Date(f.createdAt).toLocaleString()}</p>
            </div>
            <Badge variant="secondary" className="font-normal">
              {KINDS.find((k) => k.key === f.kind)?.label[lang] ?? f.kind}
            </Badge>
            <Button variant="ghost" size="icon" aria-label="View" onClick={() => void openStoredFile(f.id, "view").catch((e) => toast.error(errMsg(e)))}>
              <Eye className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Download" onClick={() => void openStoredFile(f.id, "download").catch((e) => toast.error(errMsg(e)))}>
              <Download className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete" className="hover:bg-rose-50 hover:text-rose-600" onClick={() => window.confirm(lang === "bn" ? "ফাইলটি মুছবেন?" : "Delete this file?") && void api.deleteFile(f.id).then(load).catch((e) => toast.error(errMsg(e)))}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// consent
// ---------------------------------------------------------------------------

const ACC: Record<string, { en: string; bn: string; cls: string }> = {
  REQUESTED: { en: "Waiting for you", bn: "আপনার উত্তরের অপেক্ষায়", cls: "border-amber-200 bg-amber-100 text-amber-800" },
  GRANTED: { en: "Allowed", bn: "অনুমতি দেওয়া", cls: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  DENIED: { en: "Declined", bn: "প্রত্যাখ্যাত", cls: "border-rose-200 bg-rose-100 text-rose-800" },
  REVOKED: { en: "Withdrawn", bn: "প্রত্যাহার", cls: "border-slate-200 bg-slate-100 text-slate-600" },
};

export function PatientAccessView() {
  const { lang } = useI18n();
  const [rows, setRows] = useState<AccessDTO[]>([]);
  const [docs, setDocs] = useState<DirectoryDoctor[]>([]);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([api.myAccess(), api.doctorDirectory()]);
      setRows(a.access);
      setDocs(d.doctors);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = (fn: () => Promise<unknown>) => void fn().then(load).catch((e) => toast.error(errMsg(e)));

  return (
    <Page title={lang === "bn" ? "ডাক্তারদের অ্যাক্সেস" : "Doctors who can see my information"} desc={lang === "bn" ? "আপনার সম্মতি ছাড়া কোনো ডাক্তার আপনার মেডিকেল তথ্য দেখতে পারেন না। যেকোনো সময় অনুমতি প্রত্যাহার করতে পারেন।" : "No doctor can see your medical information without your consent. You can withdraw it at any time."}>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Select value={pick || undefined} onValueChange={setPick}>
            <SelectTrigger className="w-[280px]" aria-label="Doctor">
              <SelectValue placeholder={lang === "bn" ? "ডাক্তার বাছুন" : "Choose a doctor"} />
            </SelectTrigger>
            <SelectContent>
              {docs.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!pick} onClick={() => run(() => api.grantAccess(pick))} className="bg-teal-600 text-white hover:bg-teal-700">
            <ShieldCheck className="size-4" />
            {lang === "bn" ? "অনুমতি দিন" : "Allow access"}
          </Button>
        </CardContent>
      </Card>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{lang === "bn" ? "এখনো কোনো অনুমতি/অনুরোধ নেই।" : "No permissions or requests yet."}</p> : null}
      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{a.doctorName}</p>
              <p className="text-xs text-slate-500">
                {lang === "bn" ? "অনুরোধ" : "Requested"} {date(a.requestedAt)} · {a.source.replace("_", " ").toLowerCase()}
              </p>
            </div>
            <Badge className={ACC[a.status].cls}>{ACC[a.status][lang]}</Badge>
            {a.status === "REQUESTED" ? (
              <>
                <Button size="sm" onClick={() => run(() => api.respondAccess(a.id, "grant"))} className="bg-teal-600 text-white hover:bg-teal-700">
                  {lang === "bn" ? "অনুমতি" : "Allow"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => run(() => api.respondAccess(a.id, "deny"))}>
                  {lang === "bn" ? "প্রত্যাখ্যান" : "Decline"}
                </Button>
              </>
            ) : null}
            {a.status === "GRANTED" ? (
              <Button size="sm" variant="outline" onClick={() => run(() => api.revokeAccess(a.id))}>
                <ShieldOff className="size-4" />
                {lang === "bn" ? "প্রত্যাহার" : "Withdraw"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// doctors' forms
// ---------------------------------------------------------------------------

export function PatientFormsView() {
  const { lang } = useI18n();
  const [forms, setForms] = useState<PatientFormDTO[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { forms: f } = await api.myForms();
      setForms(f);
      setAnswers(Object.fromEntries(f.map((x) => [x.id, x.response?.answers ?? {}])));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (f: PatientFormDTO) => {
    setBusy(f.id);
    try {
      await api.submitForm(f.id, answers[f.id] ?? {});
      toast.success(lang === "bn" ? "ফর্ম সংরক্ষিত হয়েছে" : "Form saved");
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  if (!forms) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-slate-400" />;
  return (
    <Page title={lang === "bn" ? "ডাক্তারের ফর্ম" : "Doctors' forms"} desc={lang === "bn" ? "যেসব ডাক্তারের সাথে আপনার অ্যাপয়েন্টমেন্ট বা অনুমতি আছে, তাদের ফর্ম এখানে দেখাবে।" : "Forms from doctors you have an appointment or consent with."}>
      {forms.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{lang === "bn" ? "এখন কোনো ফর্ম নেই।" : "No forms right now."}</p> : null}
      {forms.map((f) => {
        const a = answers[f.id] ?? {};
        const set = (id: string, v: string) => setAnswers({ ...answers, [f.id]: { ...a, [id]: v } });
        return (
          <Card key={f.id} className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{f.title}</CardTitle>
              <CardDescription>
                {f.doctorName} {f.description ? `— ${f.description}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {f.fields.map((q) => (
                <div key={q.id} className="space-y-1.5">
                  <Label className="flex items-baseline justify-between gap-2">
                    <span>
                      {q.label} {q.required ? <span className="text-rose-600">*</span> : null}
                    </span>
                    {f.response?.fieldUpdated[q.id] ? <span className="text-[11px] font-normal text-slate-400">{lang === "bn" ? "আপডেট" : "updated"} {date(f.response.fieldUpdated[q.id])}</span> : null}
                  </Label>
                  {q.type === "textarea" ? (
                    <Textarea rows={3} value={a[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                  ) : q.type === "yesno" || q.type === "select" ? (
                    <Select value={a[q.id] || undefined} onValueChange={(v) => set(q.id, v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {(q.type === "yesno" ? ["Yes", "No"] : q.options).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={q.type === "number" ? "number" : q.type === "date" ? "date" : "text"} value={a[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)} />
                  )}
                </div>
              ))}
              <Button onClick={() => void submit(f)} disabled={busy === f.id} className="bg-teal-600 text-white hover:bg-teal-700">
                {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : null}
                {lang === "bn" ? "সংরক্ষণ" : "Save answers"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </Page>
  );
}
