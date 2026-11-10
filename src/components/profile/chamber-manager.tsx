"use client";

// Chamber & Schedule manager — multiple chamber profiles per doctor.
// Each chamber stores: Clinic/Hospital/Chamber Name, full address,
// consultation days, consultation time, contact number, serial booking info.
// The primary chamber is shown on prescriptions by default.

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Hospital,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type { ChamberDTO } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type LMap = { en: string; bn: string };
const L: Record<string, LMap> = {
  saving: { en: "Saving…", bn: "সংরক্ষণ হচ্ছে…" },
  loading: { en: "Loading…", bn: "লোড হচ্ছে…" },
  chamberRequired: {
    en: "Clinic / Hospital / Chamber Name is required",
    bn: "ক্লিনিক / হাসপাতাল / চেম্বারের নাম পূরণ করুন",
  },
  chamberSaved: { en: "Chamber saved", bn: "চেম্বার সংরক্ষিত" },
  chamberDeleted: { en: "Chamber deleted", bn: "চেম্বার মুছে ফেলা হয়েছে" },
  primarySet: { en: "Primary chamber updated", bn: "প্রধান চেম্বার হালনাগাদ" },
  confirmDelete: { en: "Delete this chamber?", bn: "এই চেম্বারটি মুছে ফেলবেন?" },
  useAsPrimary: { en: "Use as primary chamber", bn: "প্রধান চেম্বার হিসেবে ব্যবহার করুন" },
};

interface ChamberForm {
  name: string;
  address: string;
  days: string;
  time: string;
  phone: string;
  serialInfo: string;
  isPrimary: boolean;
}

const EMPTY_FORM: ChamberForm = {
  name: "",
  address: "",
  days: "",
  time: "",
  phone: "",
  serialInfo: "",
  isPrimary: false,
};

export function ChamberManager({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const [chambers, setChambers] = useState<ChamberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChamberForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ChamberForm>(k: K, v: ChamberForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    try {
      const res = await api.listChambers();
      setChambers(res.chambers ?? []);
    } catch {
      /* chambers are optional */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, isPrimary: chambers.length === 0 });
    setDialogOpen(true);
  };

  const openEdit = (c: ChamberDTO) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      address: c.address,
      days: c.days,
      time: c.time,
      phone: c.phone,
      serialInfo: c.serialInfo,
      isPrimary: c.isPrimary,
    });
    setDialogOpen(true);
  };

  async function handleSave() {
    if (busy) return;
    if (!form.name.trim()) {
      toast.error(L.chamberRequired[lang]);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address,
        days: form.days,
        time: form.time,
        phone: form.phone,
        serialInfo: form.serialInfo,
        isPrimary: form.isPrimary,
      };
      if (editingId) await api.updateChamber(editingId, payload);
      else await api.createChamber(payload);
      await load();
      setDialogOpen(false);
      toast.success(L.chamberSaved[lang]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(c: ChamberDTO) {
    if (!window.confirm(L.confirmDelete[lang])) return;
    try {
      await api.deleteChamber(c.id);
      await load();
      toast.success(L.chamberDeleted[lang]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  async function handleSetPrimary(c: ChamberDTO) {
    try {
      await api.updateChamber(c.id, { isPrimary: true });
      await load();
      toast.success(L.primarySet[lang]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hospital className="size-4 text-teal-700 dark:text-teal-400" />
          {t("chambers")}
        </CardTitle>
        <CardDescription>{t("chambersDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin text-teal-700" />
            {L.loading[lang]}
          </div>
        ) : chambers.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            <Building2 className="mx-auto mb-1.5 size-6 opacity-40" />
            {t("noChambers")}
          </div>
        ) : (
          <div className="space-y-2.5">
            {chambers.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "min-w-0 rounded-lg border px-3.5 py-3",
                  c.isPrimary && "border-teal-600/50 bg-teal-50/50 dark:bg-teal-950/20"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">
                        {c.name}
                      </span>
                      {c.isPrimary ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          <Star className="size-2.5" />
                          {t("primaryChamber")}
                        </span>
                      ) : null}
                    </div>
                    {c.address ? (
                      <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="mt-0.5 size-3 shrink-0" />
                        <span className="whitespace-pre-line">{c.address}</span>
                      </div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {c.days ? (
                        <span className="inline-flex max-w-full min-w-0 items-start gap-1 break-words">
                          <Building2 className="mt-0.5 size-3 shrink-0" />
                          <span className="min-w-0 break-words">{c.days}</span>
                        </span>
                      ) : null}
                      {c.time ? (
                        <span className="inline-flex max-w-full min-w-0 items-start gap-1 break-words">
                          <Clock className="mt-0.5 size-3 shrink-0" />
                          <span className="min-w-0 break-words">{c.time}</span>
                        </span>
                      ) : null}
                      {c.phone ? (
                        <span className="inline-flex max-w-full min-w-0 items-start gap-1 break-words">
                          <Phone className="mt-0.5 size-3 shrink-0" />
                          <span className="min-w-0 break-words">{c.phone}</span>
                        </span>
                      ) : null}
                    </div>
                    {c.serialInfo ? (
                      <div className="mt-1 text-xs italic text-muted-foreground">{c.serialInfo}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex items-center gap-0.5">
                      {!c.isPrimary ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-teal-700 dark:hover:text-teal-400"
                          title={t("setPrimary")}
                          onClick={() => void handleSetPrimary(c)}
                        >
                          <Star className="size-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        title={t("editChamber")}
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        title={t("delete")}
                        onClick={() => void handleDelete(c)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={openAdd}
          className="border-dashed border-teal-600/50 text-teal-700 hover:bg-teal-50 dark:border-teal-500/50 dark:text-teal-400 dark:hover:bg-teal-950/40"
        >
          <Plus className="size-4" />
          {t("addChamber")}
        </Button>
      </CardContent>

      {/* add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingId ? t("editChamber") : t("addChamber")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("chambersDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">{t("chamberName")} *</Label>
              <Input
                id="ch-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="City Medical Centre / Popular Diagnostic Centre…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-address">{t("address")}</Label>
              <Textarea
                id="ch-address"
                rows={2}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ch-days">{t("chamberDays")}</Label>
                <Input
                  id="ch-days"
                  value={form.days}
                  onChange={(e) => set("days", e.target.value)}
                  placeholder="Sat – Thu"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-time">{t("chamberTime")}</Label>
                <Input
                  id="ch-time"
                  value={form.time}
                  onChange={(e) => set("time", e.target.value)}
                  placeholder="5:00 PM – 9:00 PM"
                />
              </div>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ch-phone">{t("chamberPhone")}</Label>
                <Input
                  id="ch-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+880…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-serial">{t("chamberSerial")}</Label>
                <Input
                  id="ch-serial"
                  value={form.serialInfo}
                  onChange={(e) => set("serialInfo", e.target.value)}
                  placeholder="01711-000000 (serial)"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <Label htmlFor="ch-primary" className="cursor-pointer text-sm font-normal">
                {L.useAsPrimary[lang]}
              </Label>
              <Switch
                id="ch-primary"
                checked={form.isPrimary}
                onCheckedChange={(v) => set("isPrimary", v)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ChamberManager;
