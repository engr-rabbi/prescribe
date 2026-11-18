"use client";

// Super Admin → accounts. The admin creates DOCTOR accounts (username + one-time temporary password),
// and can activate / suspend / deactivate any account and re-issue a temporary password.
// Clinical data is deliberately not visible here.

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, RefreshCw, UserPlus, Wand2 } from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { PASSWORD_RULES_TEXT, randomTempPassword } from "@/lib/permissions";
import { useAppStore } from "@/store/app-store";
import type { AccountStatus, UserDTO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const T = {
  title: { en: "Accounts", bn: "অ্যাকাউন্ট" },
  desc: {
    en: "Create doctor accounts with a username and a one-time temporary password. Doctors must set their own password at first login. Doctors create their own assistants; patients register themselves with Google.",
    bn: "ইউজারনেম ও একবার-ব্যবহারযোগ্য অস্থায়ী পাসওয়ার্ড দিয়ে ডাক্তারের অ্যাকাউন্ট তৈরি করুন। প্রথম লগইনে ডাক্তার নিজের পাসওয়ার্ড দিবেন। অ্যাসিস্ট্যান্ট ডাক্তার নিজে তৈরি করবেন; রোগীরা Google দিয়ে নিজেরাই নিবন্ধন করেন।",
  },
  add: { en: "New doctor account", bn: "নতুন ডাক্তার অ্যাকাউন্ট" },
  fullName: { en: "Doctor's full name", bn: "ডাক্তারের পূর্ণ নাম" },
  username: { en: "Username", bn: "ইউজারনেম" },
  usernameHint: { en: "3–30 characters: letters, digits, . _ -", bn: "৩–৩০ অক্ষর: ইংরেজি অক্ষর, সংখ্যা, . _ -" },
  temp: { en: "Temporary password", bn: "অস্থায়ী পাসওয়ার্ড" },
  email: { en: "Email (optional)", bn: "ইমেইল (ঐচ্ছিক)" },
  emailReq: { en: "Email", bn: "ইমেইল" },
  phone: { en: "Phone (optional)", bn: "ফোন (ঐচ্ছিক)" },
  status: { en: "Account status", bn: "অ্যাকাউন্টের অবস্থা" },
  generate: { en: "Generate", bn: "তৈরি করুন" },
  create: { en: "Create account", bn: "অ্যাকাউন্ট তৈরি করুন" },
  created: { en: "Account created — give these credentials to the doctor", bn: "অ্যাকাউন্ট তৈরি হয়েছে — এই তথ্য ডাক্তারকে দিন" },
  onceOnly: {
    en: "The temporary password works for ONE login and expires in 72 hours. It is shown only now.",
    bn: "অস্থায়ী পাসওয়ার্ড মাত্র একবার লগইনে কাজ করবে এবং ৭২ ঘণ্টায় মেয়াদ শেষ হবে। এটি শুধু এখনই দেখানো হচ্ছে।",
  },
  reissue: { en: "Re-issue temporary password", bn: "নতুন অস্থায়ী পাসওয়ার্ড দিন" },
  copy: { en: "Copy", bn: "কপি" },
  copied: { en: "Copied", bn: "কপি হয়েছে" },
  name: { en: "Name", bn: "নাম" },
  role: { en: "Role", bn: "ভূমিকা" },
  lastLogin: { en: "Last login", bn: "সর্বশেষ লগইন" },
  never: { en: "never", bn: "কখনো নয়" },
  pending: { en: "must set password", bn: "পাসওয়ার্ড দিতে হবে" },
  none: { en: "No accounts.", bn: "কোনো অ্যাকাউন্ট নেই।" },
  updated: { en: "Account updated", bn: "অ্যাকাউন্ট হালনাগাদ হয়েছে" },
  filter: { en: "All roles", bn: "সব ভূমিকা" },
} as const;

const STATUS_LABEL: Record<AccountStatus, { en: string; bn: string }> = {
  ACTIVE: { en: "Active", bn: "সক্রিয়" },
  SUSPENDED: { en: "Suspended", bn: "স্থগিত" },
  DEACTIVATED: { en: "Deactivated", bn: "নিষ্ক্রিয়" },
};
const ROLE_LABEL: Record<string, { en: string; bn: string }> = {
  SUPER_ADMIN: { en: "Super Admin", bn: "সুপার অ্যাডমিন" },
  DOCTOR: { en: "Doctor", bn: "ডাক্তার" },
  ASSISTANT: { en: "Assistant", bn: "অ্যাসিস্ট্যান্ট" },
  PATIENT: { en: "Patient", bn: "রোগী" },
};

function StatusBadge({ status, label }: { status: AccountStatus; label: string }) {
  const cls =
    status === "ACTIVE"
      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
      : status === "SUSPENDED"
        ? "border-amber-200 bg-amber-100 text-amber-800"
        : "border-slate-200 bg-slate-100 text-slate-600";
  return <Badge className={cls}>{label}</Badge>;
}

export function UsersManagement() {
  const { lang } = useI18n();
  const me = useAppStore((s) => s.user);
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", tempPassword: "", email: "", phone: "", status: "ACTIVE" as AccountStatus });
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const requireEmail = false; // "optional / required as configured": the server enforces REQUIRE_DOCTOR_EMAIL and reports it

  const load = useCallback(async () => {
    try {
      setUsers((await api.listUsers()).users);
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
      await api.createUser({
        role: "DOCTOR",
        name: form.name,
        username: form.username,
        tempPassword: form.tempPassword,
        email: form.email,
        phone: form.phone,
        status: form.status,
      });
      setIssued({ username: form.username.trim().toLowerCase(), password: form.tempPassword });
      setCreateOpen(false);
      setForm({ name: "", username: "", tempPassword: "", email: "", phone: "", status: "ACTIVE" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (u: UserDTO, status: AccountStatus) => {
    try {
      await api.updateUser(u.id, { status });
      toast.success(T.updated[lang]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const reissue = async (u: UserDTO) => {
    const pw = randomTempPassword();
    try {
      await api.updateUser(u.id, { tempPassword: pw });
      setIssued({ username: u.username, password: pw });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const shown = users.filter((u) => roleFilter === "ALL" || u.role === roleFilter);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-4 text-teal-600" />
            {T.title[lang]}
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl">{T.desc[lang]}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger size="sm" className="w-[150px]" aria-label="Role filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{T.filter[lang]}</SelectItem>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="size-4" />
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 text-white hover:bg-teal-700">
            <UserPlus className="size-4" />
            {T.add[lang]}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-slate-400" />
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{T.none[lang]}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.name[lang]}</TableHead>
                  <TableHead>{T.username[lang]}</TableHead>
                  <TableHead>{T.role[lang]}</TableHead>
                  <TableHead>{T.status[lang]}</TableHead>
                  <TableHead>{T.lastLogin[lang]}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email || "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{u.role === "PATIENT" ? u.patientUid : u.username}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {ROLE_LABEL[u.role]?.[lang] ?? u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1">
                      <StatusBadge status={u.status} label={STATUS_LABEL[u.status][lang]} />
                      {u.mustChangePassword ? (
                        <Badge variant="outline" className="font-normal text-amber-700">
                          {T.pending[lang]}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : T.never[lang]}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {u.role !== "PATIENT" ? (
                          <Button variant="ghost" size="sm" onClick={() => void reissue(u)} title={T.reissue[lang]}>
                            <KeyRound className="size-4" />
                          </Button>
                        ) : null}
                        {u.id !== me?.id ? (
                          <Select value={u.status} onValueChange={(v) => void setStatus(u, v as AccountStatus)}>
                            <SelectTrigger size="sm" className="w-[130px]" aria-label="Status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(STATUS_LABEL) as AccountStatus[]).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {STATUS_LABEL[k][lang]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ---- create doctor ---- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{T.add[lang]}</DialogTitle>
            <DialogDescription>{PASSWORD_RULES_TEXT[lang]}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-name">{T.fullName[lang]}</Label>
              <Input id="nd-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-user">{T.username[lang]}</Label>
              <Input id="nd-user" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <p className="text-xs text-slate-500">{T.usernameHint[lang]}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-pw">{T.temp[lang]}</Label>
              <div className="flex gap-2">
                <Input id="nd-pw" className="font-mono" value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, tempPassword: randomTempPassword() })}>
                  <Wand2 className="size-4" />
                  {T.generate[lang]}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nd-email">{requireEmail ? T.emailReq[lang] : T.email[lang]}</Label>
                <Input id="nd-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nd-phone">{T.phone[lang]}</Label>
                <Input id="nd-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{T.status[lang]}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AccountStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as AccountStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {STATUS_LABEL[k][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* ---- credentials, shown once ---- */}
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
            <Button
              variant="outline"
              onClick={() => {
                if (issued) void navigator.clipboard?.writeText(`${issued.username}\n${issued.password}`);
                toast.success(T.copied[lang]);
              }}
            >
              <Copy className="size-4" />
              {T.copy[lang]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default UsersManagement;
