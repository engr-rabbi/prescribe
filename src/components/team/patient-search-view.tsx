"use client";

// Doctor → find a patient account by UID / name / mobile / email. A search shows only a masked card; the
// medical profile, forms and reports appear only after the patient has consented to THIS doctor. Everything
// here is audited on the server. "Start consultation" opens the doctor's own patient record for that UID
// after a verification step (the patient's current data vs. the stored record).

import React, { useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Lock, Search, ShieldCheck, Stethoscope, UserSearch } from "lucide-react";

import { api, openStoredFile, type PatientProfile } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { PatientAccountSummary, PatientAccountView } from "@/lib/portal-types";
import type { PatientDTO } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const T = {
  title: { en: "Find a patient", bn: "রোগী খুঁজুন" },
  desc: {
    en: "Search self-registered patients. You see a masked card only — medical information needs the patient's consent. Every search and view is logged.",
    bn: "নিজে নিবন্ধিত রোগী খুঁজুন। শুধু মাস্ক করা কার্ড দেখা যাবে — মেডিকেল তথ্যের জন্য রোগীর সম্মতি লাগবে। প্রতিটি সার্চ ও দেখা লগ হয়।",
  },
  by: { uid: "Patient UID", name: "Name", mobile: "Mobile", email: "Email" },
  placeholder: { en: "e.g. PAT-2026-000001", bn: "যেমন PAT-2026-000001" },
  search: { en: "Search", bn: "খুঁজুন" },
  none: { en: "No matching patient account.", bn: "মিলে এমন কোনো রোগী অ্যাকাউন্ট নেই।" },
  view: { en: "Open", bn: "খুলুন" },
  request: { en: "Request access", bn: "অ্যাক্সেস চান" },
  requested: { en: "Request sent — the patient must approve it.", bn: "অনুরোধ পাঠানো হয়েছে — রোগীকে অনুমোদন দিতে হবে।" },
  locked: { en: "Medical information is locked until the patient consents to you.", bn: "রোগী আপনাকে সম্মতি না দেওয়া পর্যন্ত মেডিকেল তথ্য লক করা।" },
  start: { en: "Start consultation", bn: "কনসাল্টেশন শুরু" },
  verifyTitle: { en: "Verify the patient's current information", bn: "রোগীর বর্তমান তথ্য যাচাই করুন" },
  verifyDesc: {
    en: "The patient's own profile is shown with the date each item was last updated. Tick what you want to copy into your record, then continue.",
    bn: "রোগীর নিজের প্রোফাইল ও প্রতিটি তথ্যের সর্বশেষ আপডেটের তারিখ দেখানো হচ্ছে। যা আপনার রেকর্ডে নিতে চান তা টিক দিন, তারপর এগিয়ে যান।",
  },
  yours: { en: "Your record", bn: "আপনার রেকর্ড" },
  theirs: { en: "Patient's profile", bn: "রোগীর প্রোফাইল" },
  updated: { en: "updated", bn: "আপডেট" },
  open: { en: "Continue to prescription", bn: "প্রেসক্রিপশনে যান" },
  forms: { en: "Patient form answers", bn: "রোগীর ফর্মের উত্তর" },
  files: { en: "Reports & documents", bn: "রিপোর্ট ও ডকুমেন্ট" },
} as const;

const ACCESS_STYLE: Record<string, string> = {
  GRANTED: "border-emerald-200 bg-emerald-100 text-emerald-800",
  REQUESTED: "border-amber-200 bg-amber-100 text-amber-800",
  DENIED: "border-rose-200 bg-rose-100 text-rose-800",
  REVOKED: "border-slate-200 bg-slate-100 text-slate-600",
  NONE: "border-slate-200 bg-slate-50 text-slate-500",
};
const ACCESS_LABEL: Record<string, { en: string; bn: string }> = {
  GRANTED: { en: "Consent given", bn: "সম্মতি আছে" },
  REQUESTED: { en: "Requested", bn: "অনুরোধ পাঠানো" },
  DENIED: { en: "Declined", bn: "প্রত্যাখ্যাত" },
  REVOKED: { en: "Withdrawn", bn: "প্রত্যাহার" },
  NONE: { en: "No access", bn: "অ্যাক্সেস নেই" },
};

const MEDICAL_ROWS: { key: keyof PatientProfile; en: string; bn: string }[] = [
  { key: "dob", en: "Date of birth", bn: "জন্মতারিখ" },
  { key: "gender", en: "Gender", bn: "লিঙ্গ" },
  { key: "mobile", en: "Mobile", bn: "মোবাইল" },
  { key: "email", en: "Email", bn: "ইমেইল" },
  { key: "address", en: "Address", bn: "ঠিকানা" },
  { key: "weight", en: "Weight (kg)", bn: "ওজন (কেজি)" },
  { key: "height", en: "Height (cm)", bn: "উচ্চতা (সেমি)" },
  { key: "bloodGroup", en: "Blood group", bn: "রক্তের গ্রুপ" },
  { key: "allergies", en: "Known allergies", bn: "অ্যালার্জি" },
  { key: "conditions", en: "Existing conditions", bn: "বিদ্যমান রোগ" },
  { key: "history", en: "Previous medical history", bn: "পূর্বের চিকিৎসা ইতিহাস" },
  { key: "medications", en: "Current medication", bn: "চলমান ওষুধ" },
  { key: "surgeries", en: "Previous surgery", bn: "পূর্বের অস্ত্রোপচার" },
  { key: "familyHistory", en: "Family medical history", bn: "পারিবারিক ইতিহাস" },
  { key: "other", en: "Other information", bn: "অন্যান্য তথ্য" },
];

const d = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

export function PatientSearchView() {
  const { lang } = useI18n();
  const openEditor = useAppStore((s) => s.openEditor);
  const [by, setBy] = useState<"uid" | "name" | "mobile" | "email">("uid");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientAccountSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ uid: string; data: PatientAccountView } | null>(null);
  const [verify, setVerify] = useState<{ patient: PatientDTO; profile: PatientProfile; pick: Record<string, boolean> } | null>(null);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      setResults((await api.searchPatientAccounts(q.trim(), by)).results);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const open = async (uid: string) => {
    try {
      setView({ uid, data: await api.viewPatientAccount(uid) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const request = async (uid: string) => {
    try {
      await api.requestPatientAccess(uid);
      toast.success(T.requested[lang]);
      await run();
      if (view?.uid === uid) await open(uid);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const start = async (uid: string) => {
    try {
      const r = await api.startConsultation(uid);
      const pick: Record<string, boolean> = {};
      for (const row of MEDICAL_ROWS) {
        const mine = String((r.patient as unknown as Record<string, unknown>)[row.key] ?? "");
        const theirs = String(r.profile[row.key] ?? "");
        if (theirs && theirs !== mine) pick[row.key] = true;
      }
      setView(null);
      setVerify({ patient: r.patient, profile: r.profile, pick });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const proceed = async () => {
    if (!verify) return;
    const upd: Record<string, unknown> = {};
    for (const [k, on] of Object.entries(verify.pick)) {
      if (!on) continue;
      if (k === "history" || k === "conditions") continue; // merged into medicalHistory below
      const v = verify.profile[k as keyof PatientProfile];
      if (k === "dob") upd.dob = v;
      else if (k === "weight" || k === "height") upd[k] = v;
      else if (["gender", "mobile", "address", "bloodGroup", "allergies"].includes(k)) upd[k] = v;
    }
    if (verify.pick.history || verify.pick.conditions) {
      upd.medicalHistory = [verify.profile.conditions, verify.profile.history].filter(Boolean).join("\n");
    }
    try {
      if (Object.keys(upd).length) await api.updatePatient(verify.patient.id, upd);
      const id = verify.patient.id;
      setVerify(null);
      openEditor(null, id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const recordValue = (k: string, p: PatientDTO) => {
    const rec = p as unknown as Record<string, unknown>;
    if (k === "history" || k === "conditions") return k === "history" ? String(rec.medicalHistory ?? "") : "";
    return String(rec[k] ?? "");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserSearch className="size-5 text-teal-600" />
            {T.title[lang]}
          </CardTitle>
          <CardDescription>{T.desc[lang]}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void run(e)} className="flex flex-wrap gap-2">
            <Select value={by} onValueChange={(v) => setBy(v as typeof by)}>
              <SelectTrigger className="w-[150px]" aria-label="Search by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(T.by) as (keyof typeof T.by)[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {T.by[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="min-w-[220px] flex-1" placeholder={by === "uid" ? T.placeholder[lang] : ""} value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" />
            <Button type="submit" disabled={busy || !q.trim()} className="bg-teal-600 text-white hover:bg-teal-700">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {T.search[lang]}
            </Button>
          </form>
        </CardContent>
      </Card>

      {results ? (
        results.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{T.none[lang]}</p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.patientUid} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{r.fullName}</p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{r.patientUid}</span> · {[r.gender, r.ageYears ? `${r.ageYears}y` : ""].filter(Boolean).join(" · ") || "—"} · {r.mobile || "—"} · {r.email || "—"}
                  </p>
                </div>
                <Badge className={ACCESS_STYLE[r.access]}>{ACCESS_LABEL[r.access][lang]}</Badge>
                {r.access === "NONE" || r.access === "DENIED" || r.access === "REVOKED" ? (
                  <Button variant="outline" size="sm" onClick={() => void request(r.patientUid)}>
                    <ShieldCheck className="size-4" />
                    {T.request[lang]}
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => void open(r.patientUid)} className="bg-teal-600 text-white hover:bg-teal-700">
                  {T.view[lang]}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* ---- patient detail ---- */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {view ? (
            <>
              <DialogHeader>
                <DialogTitle>{view.data.basic.fullName}</DialogTitle>
                <DialogDescription className="font-mono">{view.data.basic.patientUid}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={ACCESS_STYLE[view.data.access]}>{ACCESS_LABEL[view.data.access][lang]}</Badge>
                <span className="text-xs text-slate-500">
                  {view.data.basic.mobile} · {view.data.basic.email}
                </span>
              </div>
              {!view.data.medical ? (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <Lock className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-2">
                    <p>{T.locked[lang]}</p>
                    {view.data.access !== "REQUESTED" ? (
                      <Button size="sm" variant="outline" onClick={() => void request(view.uid)}>
                        {T.request[lang]}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {MEDICAL_ROWS.map((row) => {
                      const v = view.data.medical![row.key];
                      return (
                        <div key={row.key}>
                          <dt className="text-xs font-medium text-slate-500">
                            {row[lang]} <span className="font-normal text-slate-400">· {T.updated[lang]} {d(view.data.medical!.fieldUpdated[row.key])}</span>
                          </dt>
                          <dd className="whitespace-pre-wrap text-sm text-slate-900">{v === null || v === "" ? "—" : String(v)}</dd>
                        </div>
                      );
                    })}
                    {view.data.medical.customFields.map((c) => (
                      <div key={c.id}>
                        <dt className="text-xs font-medium text-slate-500">
                          {c.label} <span className="font-normal text-slate-400">· {T.updated[lang]} {d(c.updatedAt)}</span>
                        </dt>
                        <dd className="text-sm text-slate-900">{c.value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {view.data.forms.map((f) => (
                    <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="mb-2 text-sm font-medium">
                        {T.forms[lang]} — {f.title}
                      </p>
                      <dl className="space-y-1.5 text-sm">
                        {f.fields.map((q2) => (
                          <div key={q2.id}>
                            <dt className="text-xs text-slate-500">{q2.label}</dt>
                            <dd>{f.response?.answers[q2.id] || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                  {view.data.files.length ? (
                    <div>
                      <p className="mb-1 text-sm font-medium">{T.files[lang]}</p>
                      <ul className="space-y-1">
                        {view.data.files.map((f) => (
                          <li key={f.id}>
                            <button type="button" className="flex items-center gap-2 text-sm text-teal-700 hover:underline" onClick={() => void openStoredFile(f.id, "view").catch((e) => toast.error(e.message))}>
                              <FileText className="size-4" />
                              {f.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
              <DialogFooter>
                {view.data.medical ? (
                  <Button onClick={() => void start(view.uid)} className="bg-teal-600 text-white hover:bg-teal-700">
                    <Stethoscope className="size-4" />
                    {T.start[lang]}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ---- verification before the consultation ---- */}
      <Dialog open={!!verify} onOpenChange={(o) => !o && setVerify(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {verify ? (
            <>
              <DialogHeader>
                <DialogTitle>{T.verifyTitle[lang]}</DialogTitle>
                <DialogDescription>{T.verifyDesc[lang]}</DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="py-1 pr-2" />
                      <th className="py-1 pr-2">{T.yours[lang]}</th>
                      <th className="py-1">{T.theirs[lang]}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MEDICAL_ROWS.filter((r) => r.key !== "email" && r.key !== "conditions" && r.key !== "medications" && r.key !== "surgeries" && r.key !== "familyHistory" && r.key !== "other").map((row) => {
                      const mine = recordValue(row.key, verify.patient);
                      const theirs = verify.profile[row.key];
                      const differs = String(theirs ?? "") !== mine && !!theirs;
                      return (
                        <tr key={row.key} className={differs ? "bg-amber-50/60" : ""}>
                          <td className="py-1.5 pr-2 align-top">
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                              <input
                                type="checkbox"
                                disabled={!differs}
                                checked={!!verify.pick[row.key]}
                                onChange={(e) => setVerify({ ...verify, pick: { ...verify.pick, [row.key]: e.target.checked } })}
                              />
                              {row[lang]}
                            </label>
                          </td>
                          <td className="py-1.5 pr-2 align-top whitespace-pre-wrap">{mine || "—"}</td>
                          <td className="py-1.5 align-top whitespace-pre-wrap">
                            {theirs === null || theirs === "" ? "—" : String(theirs)}
                            <span className="ml-1 text-[11px] text-slate-400">· {d(verify.profile.fieldUpdated[row.key])}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button onClick={() => void proceed()} className="bg-teal-600 text-white hover:bg-teal-700">
                  {T.open[lang]}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PatientSearchView;
