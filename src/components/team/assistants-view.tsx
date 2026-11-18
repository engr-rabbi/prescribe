"use client";

// Doctor → my assistants. A doctor creates, edits, suspends and sets permissions for THEIR OWN assistants only
// (the API refuses anything else). Finalizing / signing prescriptions is never delegable, so it isn't listed.

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Pencil, Trash2, UserPlus, Wand2 } from "lucide-react";

import { api, type AssistantDTO } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { ASSISTANT_PERMISSIONS, DEFAULT_ASSISTANT_PERMISSIONS, PASSWORD_RULES_TEXT, randomTempPassword } from "@/lib/permissions";
import type { AccountStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const T = {
  title: { en: "My assistants", bn: "আমার অ্যাসিস্ট্যান্ট" },
  desc: {
    en: "Assistants work only for you and only within the permissions you give. They can never finalize or sign a prescription.",
    bn: "অ্যাসিস্ট্যান্ট শুধু আপনার জন্য এবং আপনার দেওয়া অনুমতির মধ্যেই কাজ করতে পারেন। তারা কখনো প্রেসক্রিপশন ফাইনালাইজ বা সই করতে পারেন না।",
  },
  add: { en: "New assistant", bn: "নতুন অ্যাসিস্ট্যান্ট" },
  name: { en: "Assistant name", bn: "অ্যাসিস্ট্যান্টের নাম" },
  username: { en: "Username", bn: "ইউজারনেম" },
  temp: { en: "Temporary password", bn: "অস্থায়ী পাসওয়ার্ড" },
  email: { en: "Email (optional)", bn: "ইমেইল (ঐচ্ছিক)" },
  phone: { en: "Contact number (optional)", bn: "যোগাযোগ নম্বর (ঐচ্ছিক)" },
  status: { en: "Account status", bn: "অ্যাকাউন্টের অবস্থা" },
  perms: { en: "Permissions", bn: "অনুমতি" },
  generate: { en: "Generate", bn: "তৈরি করুন" },
  create: { en: "Create assistant", bn: "অ্যাসিস্ট্যান্ট তৈরি করুন" },
  save: { en: "Save", bn: "সংরক্ষণ" },
  edit: { en: "Edit assistant", bn: "অ্যাসিস্ট্যান্ট সম্পাদনা" },
  none: { en: "You have no assistants yet.", bn: "এখনো কোনো অ্যাসিস্ট্যান্ট নেই।" },
  created: { en: "Assistant created — give these credentials to them", bn: "অ্যাসিস্ট্যান্ট তৈরি হয়েছে — এই তথ্য তাকে দিন" },
  onceOnly: { en: "One login, valid 72 hours. Shown only now.", bn: "একবার লগইনের জন্য, ৭২ ঘণ্টা বৈধ। শুধু এখনই দেখানো হচ্ছে।" },
  reissue: { en: "Re-issue temporary password", bn: "নতুন অস্থায়ী পাসওয়ার্ড" },
  remove: { en: "Remove assistant", bn: "অ্যাসিস্ট্যান্ট সরান" },
  removeConfirm: { en: "Remove this assistant? Their account is deactivated (history is kept).", bn: "এই অ্যাসিস্ট্যান্টকে সরাবেন? অ্যাকাউন্ট নিষ্ক্রিয় হবে (ইতিহাস থাকবে)।" },
  pending: { en: "must set password", bn: "পাসওয়ার্ড দিতে হবে" },
  copy: { en: "Copy", bn: "কপি" },
} as const;
const STATUS: Record<AccountStatus, { en: string; bn: string }> = {
  ACTIVE: { en: "Active", bn: "সক্রিয়" },
  SUSPENDED: { en: "Suspended", bn: "স্থগিত" },
  DEACTIVATED: { en: "Deactivated", bn: "নিষ্ক্রিয়" },
};

function PermissionSwitches({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { lang } = useI18n();
  return (
    <div className="space-y-2">
      {ASSISTANT_PERMISSIONS.map((p) => (
        <label key={p.key} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
          <span>
            <span className="block text-sm font-medium text-slate-900">{p[lang]}</span>
            <span className="block text-xs text-slate-500">{p.hint[lang]}</span>
          </span>
          <Switch
            checked={value.includes(p.key)}
            onCheckedChange={(on) => onChange(on ? [...value, p.key] : value.filter((k) => k !== p.key))}
          />
        </label>
      ))}
    </div>
  );
}

export function AssistantsView() {
  const { lang } = useI18n();
  const [list, setList] = useState<AssistantDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", tempPassword: "", email: "", phone: "", status: "ACTIVE" as AccountStatus, permissions: DEFAULT_ASSISTANT_PERMISSIONS as string[] });
  const [edit, setEdit] = useState<AssistantDTO | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api.listAssistants()).assistants);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api.createAssistant({ ...form });
      setIssued({ username: form.username.trim().toLowerCase(), password: form.tempPassword });
      setCreateOpen(false);
      setForm({ name: "", username: "", tempPassword: "", email: "", phone: "", status: "ACTIVE", permissions: DEFAULT_ASSISTANT_PERMISSIONS });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await api.updateAssistant(edit.id, { name: edit.name, email: edit.email, phone: edit.phone, status: edit.status, permissions: edit.permissions });
      setEdit(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const reissue = async (a: AssistantDTO) => {
    const pw = randomTempPassword();
    try {
      await api.updateAssistant(a.id, { tempPassword: pw });
      setIssued({ username: a.username, password: pw });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const remove = async (a: AssistantDTO) => {
    if (!window.confirm(T.removeConfirm[lang])) return;
    try {
      await api.removeAssistant(a.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Card className="mx-auto max-w-5xl border-slate-200 shadow-sm">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">{T.title[lang]}</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">{T.desc[lang]}</CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 text-white hover:bg-teal-700">
          <UserPlus className="size-4" />
          {T.add[lang]}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-slate-400" />
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{T.none[lang]}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {a.name} <span className="font-mono text-xs font-normal text-slate-500">@{a.username}</span>
                  </p>
                  <p className="text-xs text-slate-500">{[a.phone, a.email].filter(Boolean).join(" · ") || "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {ASSISTANT_PERMISSIONS.filter((p) => a.permissions.includes(p.key)).map((p) => (
                      <Badge key={p.key} variant="secondary" className="font-normal">
                        {p[lang]}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Badge className={a.status === "ACTIVE" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"}>{STATUS[a.status][lang]}</Badge>
                {a.mustChangePassword ? (
                  <Badge variant="outline" className="font-normal text-amber-700">
                    {T.pending[lang]}
                  </Badge>
                ) : null}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" title={T.edit[lang]} aria-label={T.edit[lang]} onClick={() => setEdit({ ...a })}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={T.reissue[lang]} aria-label={T.reissue[lang]} onClick={() => void reissue(a)}>
                    <KeyRound className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={T.remove[lang]} aria-label={T.remove[lang]} onClick={() => void remove(a)} className="hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{T.add[lang]}</DialogTitle>
            <DialogDescription>{PASSWORD_RULES_TEXT[lang]}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="na-name">{T.name[lang]}</Label>
              <Input id="na-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-user">{T.username[lang]}</Label>
              <Input id="na-user" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-pw">{T.temp[lang]}</Label>
              <div className="flex gap-2">
                <Input id="na-pw" className="font-mono" value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, tempPassword: randomTempPassword() })}>
                  <Wand2 className="size-4" />
                  {T.generate[lang]}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="na-email">{T.email[lang]}</Label>
                <Input id="na-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="na-phone">{T.phone[lang]}</Label>
                <Input id="na-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{T.status[lang]}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AccountStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS) as AccountStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {STATUS[k][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{T.perms[lang]}</Label>
              <PermissionSwitches value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void create()} disabled={busy || !form.name || !form.username || !form.tempPassword} className="bg-teal-600 text-white hover:bg-teal-700">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {T.create[lang]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{T.edit[lang]}</DialogTitle>
            <DialogDescription>@{edit?.username}</DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{T.name[lang]}</Label>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{T.email[lang]}</Label>
                  <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{T.phone[lang]}</Label>
                  <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{T.status[lang]}</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as AccountStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS) as AccountStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {STATUS[k][lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{T.perms[lang]}</Label>
                <PermissionSwitches value={edit.permissions} onChange={(permissions) => setEdit({ ...edit, permissions })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => void saveEdit()} disabled={busy} className="bg-teal-600 text-white hover:bg-teal-700">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {T.save[lang]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{T.created[lang]}</DialogTitle>
            <DialogDescription>{T.onceOnly[lang]}</DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-4 font-mono text-sm">
              <div>
                {T.username[lang]}: <b>{issued.username}</b>
              </div>
              <div>
                {T.temp[lang]}: <b>{issued.password}</b>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => issued && void navigator.clipboard?.writeText(`${issued.username}\n${issued.password}`)}>
              <Copy className="size-4" />
              {T.copy[lang]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default AssistantsView;
