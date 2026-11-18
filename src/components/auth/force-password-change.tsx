"use client";

// Shown INSTEAD of the app until a temporary password has been replaced. (The API enforces the same rule —
// every other endpoint answers PASSWORD_CHANGE_REQUIRED — this screen just makes it usable.)

import React, { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { PASSWORD_RULES_TEXT, passwordProblem } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const T = {
  title: { en: "Set your own password", bn: "নিজের পাসওয়ার্ড নির্ধারণ করুন" },
  why: {
    en: "You signed in with a temporary password. For your security you must choose a new password before you can continue. The temporary password stops working as soon as you do.",
    bn: "আপনি অস্থায়ী পাসওয়ার্ড দিয়ে লগইন করেছেন। নিরাপত্তার জন্য এগিয়ে যাওয়ার আগে নতুন পাসওয়ার্ড দিতে হবে। নতুন পাসওয়ার্ড দেওয়ার সাথে সাথে অস্থায়ী পাসওয়ার্ড অকার্যকর হবে।",
  },
  current: { en: "Temporary password", bn: "অস্থায়ী পাসওয়ার্ড" },
  next: { en: "New password", bn: "নতুন পাসওয়ার্ড" },
  confirm: { en: "Confirm new password", bn: "নতুন পাসওয়ার্ড নিশ্চিত করুন" },
  mismatch: { en: "The two passwords do not match", bn: "দুটি পাসওয়ার্ড মেলেনি" },
  save: { en: "Save and continue", bn: "সংরক্ষণ করে এগিয়ে যান" },
  logout: { en: "Sign out", bn: "লগআউট" },
  done: { en: "Password updated", bn: "পাসওয়ার্ড হালনাগাদ হয়েছে" },
} as const;

export function ForcePasswordChange({ user, onDone, onLogout }: { user: SessionUser; onDone: (u: SessionUser) => void; onLogout: () => void }) {
  const { lang } = useI18n();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = pw ? passwordProblem(pw, { username: user.username, email: user.email }) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pw !== pw2) return void toast.error(T.mismatch[lang]);
    setBusy(true);
    try {
      const res = await api.changePassword(cur, pw);
      toast.success(T.done[lang]);
      onDone(res.user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-md space-y-5 rounded-xl border bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-teal-600 text-white">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{T.title[lang]}</h1>
            <p className="text-xs text-slate-500">
              {user.name} · {user.username}
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{T.why[lang]}</p>

        <div className="space-y-1.5">
          <Label htmlFor="fp-cur">{T.current[lang]}</Label>
          <Input id="fp-cur" type={show ? "text" : "password"} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fp-new">{T.next[lang]}</Label>
          <div className="relative">
            <Input id="fp-new" type={show ? "text" : "password"} autoComplete="new-password" className="pr-10" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Show password">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className={`text-xs ${problem ? "text-rose-600" : "text-slate-500"}`}>{problem ?? PASSWORD_RULES_TEXT[lang]}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fp-new2">{T.confirm[lang]}</Label>
          <Input id="fp-new2" type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onLogout} className="text-slate-500">
            <LogOut className="size-4" />
            {T.logout[lang]}
          </Button>
          <Button type="submit" disabled={busy || !cur || !pw || !!problem} className="bg-teal-600 text-white hover:bg-teal-700">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {T.save[lang]}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ForcePasswordChange;
