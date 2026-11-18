"use client";

// Doctor (or assistant with "appointments.manage") → appointment requests of THIS doctor only.

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Check, Loader2, X } from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { AppointmentDTO } from "@/lib/portal-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const T = {
  title: { en: "Appointment requests", bn: "অ্যাপয়েন্টমেন্টের অনুরোধ" },
  desc: { en: "Requests sent by patients to you.", bn: "রোগীদের পাঠানো আপনার অ্যাপয়েন্টমেন্ট অনুরোধ।" },
  none: { en: "No appointment requests.", bn: "কোনো অনুরোধ নেই।" },
  confirm: { en: "Confirm", bn: "নিশ্চিত করুন" },
  decline: { en: "Decline", bn: "বাতিল" },
  complete: { en: "Mark completed", bn: "সম্পন্ন" },
  when: { en: "Date & time", bn: "তারিখ ও সময়" },
  note: { en: "Note to patient", bn: "রোগীর জন্য নোট" },
  preferred: { en: "Preferred", bn: "পছন্দের সময়" },
  consent: { en: "medical info shared", bn: "মেডিকেল তথ্য শেয়ার" },
} as const;
const STATUS: Record<string, { en: string; bn: string; cls: string }> = {
  REQUESTED: { en: "Requested", bn: "অনুরোধ", cls: "border-amber-200 bg-amber-100 text-amber-800" },
  CONFIRMED: { en: "Confirmed", bn: "নিশ্চিত", cls: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  DECLINED: { en: "Declined", bn: "বাতিল", cls: "border-rose-200 bg-rose-100 text-rose-800" },
  CANCELLED: { en: "Cancelled", bn: "রোগী বাতিল করেছেন", cls: "border-slate-200 bg-slate-100 text-slate-600" },
  COMPLETED: { en: "Completed", bn: "সম্পন্ন", cls: "border-sky-200 bg-sky-100 text-sky-800" },
};

export function AppointmentsView() {
  const { lang } = useI18n();
  const [items, setItems] = useState<AppointmentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, { when: string; note: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.doctorAppointments()).appointments);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (a: AppointmentDTO, status: "CONFIRMED" | "DECLINED" | "COMPLETED") => {
    setBusy(a.id);
    try {
      const dd = draft[a.id];
      await api.updateAppointment(a.id, {
        status,
        scheduledAt: dd?.when ? new Date(dd.when).toISOString() : a.scheduledAt,
        doctorNote: dd?.note ?? a.doctorNote,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mx-auto max-w-4xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarCheck className="size-5 text-teal-600" />
          {T.title[lang]}
        </CardTitle>
        <CardDescription>{T.desc[lang]}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-slate-400" />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{T.none[lang]}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => {
              const st = STATUS[a.status];
              const open = a.status === "REQUESTED" || a.status === "CONFIRMED";
              return (
                <li key={a.id} className="space-y-2 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{a.patientName}</p>
                    <span className="font-mono text-xs text-slate-500">{a.patientUid}</span>
                    <Badge className={st.cls}>{st[lang]}</Badge>
                    {a.consent ? (
                      <Badge variant="outline" className="font-normal text-emerald-700">
                        {T.consent[lang]}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-600">
                    {T.preferred[lang]}: {a.preferredDate} {a.preferredTime}
                    {a.scheduledAt ? ` · ${new Date(a.scheduledAt).toLocaleString()}` : ""}
                  </p>
                  {a.reason ? <p className="text-sm text-slate-700">{a.reason}</p> : null}
                  {open ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input type="datetime-local" className="w-[210px]" aria-label={T.when[lang]} value={draft[a.id]?.when ?? ""} onChange={(e) => setDraft({ ...draft, [a.id]: { when: e.target.value, note: draft[a.id]?.note ?? a.doctorNote } })} />
                      <Input className="min-w-[200px] flex-1" placeholder={T.note[lang]} value={draft[a.id]?.note ?? a.doctorNote} onChange={(e) => setDraft({ ...draft, [a.id]: { when: draft[a.id]?.when ?? "", note: e.target.value } })} />
                      {a.status === "REQUESTED" ? (
                        <>
                          <Button size="sm" disabled={busy === a.id} onClick={() => void act(a, "CONFIRMED")} className="bg-teal-600 text-white hover:bg-teal-700">
                            <Check className="size-4" />
                            {T.confirm[lang]}
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => void act(a, "DECLINED")}>
                            <X className="size-4" />
                            {T.decline[lang]}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => void act(a, "COMPLETED")}>
                          {T.complete[lang]}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default AppointmentsView;
