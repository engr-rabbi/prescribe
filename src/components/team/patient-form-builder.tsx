"use client";

// Doctor → "Patient registration form / medical questionnaire". Patients who have a relationship with the doctor
// (consent or a live appointment) fill it in from their own account; answers keep a last-updated date.

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { QuestionField } from "@/lib/portal-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const T = {
  title: { en: "Patient registration form", bn: "রোগীর রেজিস্ট্রেশন ফর্ম" },
  desc: {
    en: "Questions you want patients to answer before the visit. Patients fill it in from their own account.",
    bn: "ভিজিটের আগে রোগীরা যে প্রশ্নের উত্তর দেবেন। রোগীরা নিজের অ্যাকাউন্ট থেকে পূরণ করেন।",
  },
  formTitle: { en: "Form title", bn: "ফর্মের শিরোনাম" },
  intro: { en: "Short introduction", bn: "ছোট ভূমিকা" },
  active: { en: "Visible to patients", bn: "রোগীদের কাছে দৃশ্যমান" },
  addQ: { en: "Add question", bn: "প্রশ্ন যোগ" },
  question: { en: "Question", bn: "প্রশ্ন" },
  options: { en: "Options (comma separated)", bn: "অপশন (কমা দিয়ে)" },
  required: { en: "Required", bn: "আবশ্যিক" },
  save: { en: "Save form", bn: "ফর্ম সংরক্ষণ" },
  saved: { en: "Form saved", bn: "ফর্ম সংরক্ষিত" },
} as const;
const TYPES: Record<QuestionField["type"], { en: string; bn: string }> = {
  text: { en: "Short text", bn: "ছোট লেখা" },
  textarea: { en: "Long text", bn: "বড় লেখা" },
  number: { en: "Number", bn: "সংখ্যা" },
  date: { en: "Date", bn: "তারিখ" },
  yesno: { en: "Yes / No", bn: "হ্যাঁ / না" },
  select: { en: "Choose one", bn: "একটি বাছাই" },
};

export function PatientFormBuilder() {
  const { lang } = useI18n();
  const [title, setTitle] = useState("New patient form");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [fields, setFields] = useState<QuestionField[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getQuestionnaire()
      .then(({ questionnaire: q }) => {
        if (q) {
          setTitle(q.title);
          setDescription(q.description);
          setActive(q.active);
          setFields(q.fields);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const move = (i: number, dir: -1 | 1) => {
    const next = [...fields];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
  };
  const patch = (i: number, p: Partial<QuestionField>) => setFields(fields.map((f, k) => (k === i ? { ...f, ...p } : f)));

  const save = async () => {
    setBusy(true);
    try {
      await api.saveQuestionnaire({ title, description, active, fields });
      toast.success(T.saved[lang]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="size-4 text-teal-600" />
          {T.title[lang]}
        </CardTitle>
        <CardDescription>{T.desc[lang]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="size-5 animate-spin text-slate-400" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder={T.formTitle[lang]} value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder={T.intro[lang]} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={active} onCheckedChange={setActive} />
              {T.active[lang]}
            </label>
            <ul className="space-y-2">
              {fields.map((f, i) => (
                <li key={f.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="min-w-[220px] flex-1" placeholder={T.question[lang]} value={f.label} onChange={(e) => patch(i, { label: e.target.value })} />
                    <Select value={f.type} onValueChange={(v) => patch(i, { type: v as QuestionField["type"] })}>
                      <SelectTrigger className="w-[150px]" aria-label="Type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TYPES) as QuestionField["type"][]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {TYPES[k][lang]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={f.required} onCheckedChange={(v) => patch(i, { required: v })} />
                      {T.required[lang]}
                    </label>
                    <Button type="button" variant="ghost" size="icon" aria-label="Up" onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Down" onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setFields(fields.filter((_, k) => k !== i))} className="hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {f.type === "select" ? (
                    <Input placeholder={T.options[lang]} value={f.options.join(", ")} onChange={(e) => patch(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setFields([...fields, { id: `q${Date.now().toString(36)}`, label: "", type: "text", options: [], required: false }])}>
                <Plus className="size-4" />
                {T.addQ[lang]}
              </Button>
              <Button type="button" onClick={() => void save()} disabled={busy} className="bg-teal-600 text-white hover:bg-teal-700">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {T.save[lang]}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PatientFormBuilder;
