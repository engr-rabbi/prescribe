"use client";

// Admin console — user management, medicine database import & audit logs.
// Rendered only for SUPER_ADMIN (guarded internally as well).

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Database,
  FileUp,
  FlaskConical,
  KeyRound,
  Leaf,
  Loader2,
  Pill,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/store/app-store";
import type { Role, UserDTO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BackupsPanel } from "@/components/admin/backups-panel";

interface AdminPanelProps {
  className?: string;
}

// Local EN/BN labels for strings missing from the shared i18n DICT.
type LMap = { en: string; bn: string };

const L: Record<string, LMap> = {
  accessDenied: { en: "Access Denied", bn: "প্রবেশাধিকার নেই" },
  accessDeniedDesc: {
    en: "Only Super Admin accounts can open the administration console.",
    bn: "শুধুমাত্র সুপার অ্যাডমিন অ্যাকাউন্ট প্রশাসন কনসোল খুলতে পারে।",
  },
  usersDesc: {
    en: "Manage accounts, roles and access for your clinic.",
    bn: "আপনার ক্লিনিকের অ্যাকাউন্ট, ভূমিকা ও অ্যাক্সেস ব্যবস্থাপনা করুন।",
  },
  addUserDesc: {
    en: "Create a new account. The user can sign in immediately.",
    bn: "নতুন অ্যাকাউন্ট তৈরি করুন। ব্যবহারকারী সাথে সাথে লগইন করতে পারবেন।",
  },
  resetPassword: { en: "Reset Password", bn: "পাসওয়ার্ড রিসেট" },
  resetPasswordDesc: { en: "Set a new password for", bn: "নতুন পাসওয়ার্ড নির্ধারণ করুন —" },
  newPassword: { en: "New Password", bn: "নতুন পাসওয়ার্ড" },
  pwResetDone: { en: "Password reset successfully.", bn: "পাসওয়ার্ড সফলভাবে রিসেট হয়েছে।" },
  userCreated: { en: "User created successfully.", bn: "ব্যবহারকারী সফলভাবে তৈরি হয়েছে।" },
  userUpdated: { en: "User updated.", bn: "ব্যবহারকারী হালনাগাদ হয়েছে।" },
  pwRequired: { en: "Please fill in all fields (password ≥ 6 characters).", bn: "সব ঘর পূরণ করুন (পাসওয়ার্ড ≥ ৬ অক্ষর)।" },
  totalMedicines: { en: "Total Medicines", bn: "মোট ঔষধ" },
  allopathic: { en: "Allopathic", bn: "অ্যালোপ্যাথিক" },
  herbal: { en: "Herbal", bn: "হারবাল" },
  dosageForms: { en: "Dosage Forms", bn: "ডোজ ফর্ম" },
  manufacturers: { en: "Manufacturers", bn: "প্রস্তুতকারক" },
  medicineDesc: {
    en: "Master medicine data powering the click-to-select prescribing engine.",
    bn: "ক্লিক-টু-সিলেক্ট প্রেসক্রিপশন ইঞ্জিনের জন্য মাস্টার ঔষধ ডাটা।",
  },
  importDesc: {
    en: "Re-import the supplied medicine CSV (upload/medicine_english.csv). Existing records are updated; the master data is never deleted.",
    bn: "সরবরাহকৃত ঔষধ CSV (upload/medicine_english.csv) পুনরায় ইমপোর্ট করুন। বিদ্যমান রেকর্ড হালনাগাদ হয়; মাস্টার ডাটা কখনো মুছে ফেলা হয় না।",
  },
  import: { en: "Import Medicines", bn: "ঔষধ ইমপোর্ট" },
  importing: { en: "Importing…", bn: "ইমপোর্ট হচ্ছে…" },
  imported: { en: "Imported", bn: "ইমপোর্ট হয়েছে" },
  skipped: { en: "Skipped", bn: "বাদ পড়েছে" },
  errors: { en: "Errors", bn: "ত্রুটি" },
  importDone: { en: "Medicine import finished.", bn: "ঔষধ ইমপোর্ট সম্পন্ন হয়েছে।" },
  logsDesc: {
    en: "Latest 200 system events, newest first.",
    bn: "সর্বশেষ ২০০টি সিস্টেম ইভেন্ট, নতুন আগে।",
  },
  refresh: { en: "Refresh", bn: "রিফ্রেশ" },
  time: { en: "Time", bn: "সময়" },
  entity: { en: "Entity", bn: "এনটিটি" },
  details: { en: "Details", bn: "বিবরণ" },
  noLogs: { en: "No audit events recorded yet.", bn: "এখনো কোনো অডিট ইভেন্ট নেই।" },
  noUsers: { en: "No users found.", bn: "কোনো ব্যবহারকারী পাওয়া যায়নি।" },
};

interface AuditLogRow {
  id: string;
  userEmail: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

interface ImportReport {
  imported: number;
  skipped: number;
  errors: string[];
}

function roleBadge(role: Role, label: string) {
  if (role === "SUPER_ADMIN") return <Badge>{label}</Badge>;
  if (role === "DOCTOR") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

function actionBadge(action: string) {
  const a = action.toUpperCase();
  if (a.includes("DELETE")) return <Badge variant="destructive">{action}</Badge>;
  if (a.includes("CREATE")) {
    return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{action}</Badge>;
  }
  if (a.includes("UPDATE")) {
    return <Badge className="border-teal-200 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-900/40 dark:text-teal-300">{action}</Badge>;
  }
  if (a.includes("LOGIN") || a.includes("LOGOUT")) return <Badge variant="secondary">{action}</Badge>;
  return <Badge variant="outline">{action}</Badge>;
}

export function AdminPanel({ className }: AdminPanelProps) {
  const { lang, t } = useI18n();
  const s = useCallback((m: LMap) => m[lang], [lang]);
  const user = useAppStore((st) => st.user);

  const isAdmin = user?.role === "SUPER_ADMIN";

  // ---- Users ----
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState<{ name: string; email: string; password: string; role: Role }>({
    name: "",
    email: "",
    password: "",
    role: "ASSISTANT",
  });
  const [resetTarget, setResetTarget] = useState<UserDTO | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ---- Medicine database ----
  const [stats, setStats] = useState<{ total: number; allopathic: number; herbal: number; forms: number; manufacturers: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  // ---- Audit logs ----
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setUsersLoading(false);
    }
  }, [t]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await api.medicineStats());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setStatsLoading(false);
    }
  }, [t]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await api.auditLogs(200);
      setLogs(res.logs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setLogsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadUsers();
    void loadStats();
    void loadLogs();
  }, [isAdmin, loadUsers, loadStats, loadLogs]);

  async function handleToggleActive(u: UserDTO, checked: boolean) {
    setTogglingId(u.id);
    try {
      await api.updateUser(u.id, { active: checked });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active: checked } : x)));
      toast.success(s(L.userUpdated));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleCreateUser() {
    if (addBusy) return;
    const { name, email, password, role } = addForm;
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error(s(L.pwRequired));
      return;
    }
    setAddBusy(true);
    try {
      await api.createUser({ name: name.trim(), email: email.trim(), password, role });
      toast.success(s(L.userCreated));
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "ASSISTANT" });
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setAddBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget || resetBusy) return;
    if (resetPw.length < 6) {
      toast.error(s(L.pwRequired));
      return;
    }
    setResetBusy(true);
    try {
      await api.updateUser(resetTarget.id, { password: resetPw });
      toast.success(s(L.pwResetDone));
      setResetTarget(null);
      setResetPw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setResetBusy(false);
    }
  }

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    try {
      const res = await api.importMedicines();
      setReport(res);
      toast.success(`${s(L.importDone)} (+${res.imported})`);
      await loadStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setImporting(false);
    }
  }

  function roleLabel(r: Role): string {
    if (r === "SUPER_ADMIN") return t("superAdmin");
    if (r === "DOCTOR") return t("doctor");
    return t("assistant");
  }

  const statCards = stats
    ? [
        { icon: Pill, label: s(L.totalMedicines), value: stats.total },
        { icon: FlaskConical, label: s(L.allopathic), value: stats.allopathic },
        { icon: Leaf, label: s(L.herbal), value: stats.herbal },
        { icon: Database, label: s(L.dosageForms), value: stats.forms },
        { icon: Building2, label: s(L.manufacturers), value: stats.manufacturers },
      ]
    : [];

  // ---------------- Access denied guard ----------------
  if (!isAdmin) {
    return (
      <div className={cn("flex justify-center py-16", className)}>
        <Card className="max-w-md border-destructive/30">
          <CardHeader className="items-center text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="size-6 text-destructive" />
            </div>
            <CardTitle className="text-lg">{s(L.accessDenied)}</CardTitle>
            <CardDescription>{s(L.accessDeniedDesc)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <Tabs defaultValue="users">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" />
            {t("userManagement")}
          </TabsTrigger>
          <TabsTrigger value="medicines" className="gap-1.5">
            <Database className="size-4" />
            {t("medicineDatabase")}
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <ScrollText className="size-4" />
            {t("auditLogs")}
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-1.5">
            {lang === "bn" ? "ব্যাকআপ" : "Backups"}
          </TabsTrigger>
        </TabsList>

        {/* ================= User Management ================= */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("userManagement")}</CardTitle>
              <CardDescription>{s(L.usersDesc)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end">
                <Button
                  onClick={() => setAddOpen(true)}
                  className="bg-gradient-to-r from-teal-700 to-emerald-600 text-white hover:from-teal-800 hover:to-emerald-700"
                >
                  <UserPlus className="size-4" />
                  {t("addUser")}
                </Button>
              </div>

              {usersLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="mr-2 size-5 animate-spin text-teal-700" />
                  {t("loading")}
                </div>
              ) : users.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{s(L.noUsers)}</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>{t("name")}</TableHead>
                        <TableHead>{t("email")}</TableHead>
                        <TableHead>{t("role")}</TableHead>
                        <TableHead>{t("active")}</TableHead>
                        <TableHead className="text-right">{t("actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>{roleBadge(u.role, roleLabel(u.role))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={u.active}
                                disabled={togglingId === u.id || u.id === user?.id}
                                onCheckedChange={(v) => handleToggleActive(u, v)}
                              />
                              <span
                                className={cn(
                                  "text-xs",
                                  u.active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                                )}
                              >
                                {u.active ? t("active") : t("inactive")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setResetTarget(u);
                                setResetPw("");
                              }}
                            >
                              <KeyRound className="size-4" />
                              {s(L.resetPassword)}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= Medicine Database ================= */}
        <TabsContent value="medicines" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {statsLoading && !stats
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="space-y-2">
                      <div className="h-4 w-4 rounded bg-muted" />
                      <div className="h-6 w-16 rounded bg-muted" />
                      <div className="h-3 w-20 rounded bg-muted" />
                    </CardContent>
                  </Card>
                ))
              : statCards.map(({ icon: Icon, label, value }) => (
                  <Card key={label}>
                    <CardContent className="space-y-1">
                      <Icon className="size-4 text-teal-700 dark:text-teal-400" />
                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {lang === "bn"
                          ? String(value).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)])
                          : value.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileUp className="size-4 text-teal-700 dark:text-teal-400" />
                {s(L.import)}
              </CardTitle>
              <CardDescription>{s(L.importDesc)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-gradient-to-r from-teal-700 to-emerald-600 text-white hover:from-teal-800 hover:to-emerald-700"
                >
                  {importing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {s(L.importing)}
                    </>
                  ) : (
                    <>
                      <FileUp className="size-4" />
                      {s(L.import)}
                    </>
                  )}
                </Button>
                {statsLoading && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <RefreshCw className="size-3.5 animate-spin" />
                    {t("loading")}
                  </span>
                )}
              </div>

              {report && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {report.imported}
                      </p>
                      <p className="text-xs text-muted-foreground">{s(L.imported)}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{report.skipped}</p>
                      <p className="text-xs text-muted-foreground">{s(L.skipped)}</p>
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-2xl font-bold tabular-nums",
                          report.errors.length > 0 && "text-destructive"
                        )}
                      >
                        {report.errors.length}
                      </p>
                      <p className="text-xs text-muted-foreground">{s(L.errors)}</p>
                    </div>
                  </div>
                  {report.errors.length > 0 && (
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-background p-2 font-mono text-xs text-destructive">
                      {report.errors.map((e, i) => (
                        <p key={i} className="break-words">
                          • {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= Audit Logs ================= */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="size-4 text-teal-700 dark:text-teal-400" />
                {t("auditLogs")}
              </CardTitle>
              <CardDescription>{s(L.logsDesc)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={logsLoading}>
                  {logsLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {s(L.refresh)}
                </Button>
              </div>

              {logs.length === 0 && !logsLoading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">{s(L.noLogs)}</p>
              ) : (
                <div className="max-h-[560px] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted">
                      <TableRow>
                        <TableHead className="w-40">{s(L.time)}</TableHead>
                        <TableHead>{t("email")}</TableHead>
                        <TableHead>{t("role")}</TableHead>
                        <TableHead>{t("actions")}</TableHead>
                        <TableHead>{s(L.entity)}</TableHead>
                        <TableHead className="min-w-48">{s(L.details)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {new Date(log.createdAt).toLocaleString(
                              lang === "bn" ? "bn-BD" : "en-GB",
                              { dateStyle: "short", timeStyle: "short" }
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{log.userEmail}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[11px]">
                              {log.userRole}
                            </Badge>
                          </TableCell>
                          <TableCell>{actionBadge(log.action)}</TableCell>
                          <TableCell className="text-xs">{log.entity}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={log.details}>
                            {log.details}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
              <TabsContent value="backups" className="space-y-4">
          <BackupsPanel />
        </TabsContent>
      </Tabs>

      {/* ================= Add User dialog ================= */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4 text-teal-700 dark:text-teal-400" />
              {t("addUser")}
            </DialogTitle>
            <DialogDescription>{s(L.addUserDesc)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="au-name">{t("name")}</Label>
              <Input
                id="au-name"
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Dr. …"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="au-email">{t("email")}</Label>
              <Input
                id="au-email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="name@rx.local"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="au-password">{t("password")}</Label>
              <Input
                id="au-password"
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("role")}</Label>
              <Select
                value={addForm.role}
                onValueChange={(v) => setAddForm((p) => ({ ...p, role: v as Role }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">{t("superAdmin")}</SelectItem>
                  <SelectItem value="DOCTOR">{t("doctor")}</SelectItem>
                  <SelectItem value="ASSISTANT">{t("assistant")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={addBusy}
              className="bg-gradient-to-r from-teal-700 to-emerald-600 text-white hover:from-teal-800 hover:to-emerald-700"
            >
              {addBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("loading")}
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  {t("addUser")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= Reset password dialog ================= */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-teal-700 dark:text-teal-400" />
              {s(L.resetPassword)}
            </DialogTitle>
            <DialogDescription>
              {s(L.resetPasswordDesc)} <span className="font-medium text-foreground">{resetTarget?.email}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rp-password">{s(L.newPassword)}</Label>
            <Input
              id="rp-password"
              type="password"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetBusy}>
              {t("cancel")}
            </Button>
            <Button onClick={handleResetPassword} disabled={resetBusy}>
              {resetBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("loading")}
                </>
              ) : (
                <>
                  <KeyRound className="size-4" />
                  {s(L.resetPassword)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminPanel;
