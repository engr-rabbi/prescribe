"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { PatientDTO } from "@/lib/types";
import { BLOOD_GROUPS } from "@/lib/constants";
import { pl } from "@/components/patients/labels";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

export interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog edits this patient, otherwise it creates a new one. */
  patient?: PatientDTO | null;
  onSuccess?: (patient: PatientDTO) => void;
}

interface FormState {
  name: string;
  ageYears: string;
  ageMonths: string;
  dob: string;
  gender: string;
  mobile: string;
  address: string;
  weight: string;
  height: string;
  bloodGroup: string;
  allergies: string;
  medicalHistory: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  ageYears: "",
  ageMonths: "",
  dob: "",
  gender: "MALE",
  mobile: "",
  address: "",
  weight: "",
  height: "",
  bloodGroup: "",
  allergies: "",
  medicalHistory: "",
};

// Radix Select does not allow empty item values — sentinel for "no blood group".
const BG_NONE = "__none__";

function toForm(p: PatientDTO): FormState {
  return {
    name: p.name ?? "",
    ageYears: p.ageYears != null ? String(p.ageYears) : "",
    ageMonths: p.ageMonths != null ? String(p.ageMonths) : "",
    dob: p.dob ? p.dob.slice(0, 10) : "",
    gender: p.gender || "MALE",
    mobile: p.mobile ?? "",
    address: p.address ?? "",
    weight: p.weight != null ? String(p.weight) : "",
    height: p.height != null ? String(p.height) : "",
    bloodGroup: p.bloodGroup ?? "",
    allergies: p.allergies ?? "",
    medicalHistory: p.medicalHistory ?? "",
  };
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function PatientFormDialog({
  open,
  onOpenChange,
  patient = null,
  onSuccess,
}: PatientFormDialogProps) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(patient ? toForm(patient) : EMPTY_FORM);
    }
  }, [open, patient]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error(t("required"));
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<PatientDTO> = {
        name: form.name.trim(),
        ageYears: numOrNull(form.ageYears),
        ageMonths: numOrNull(form.ageMonths),
        dob: form.dob || null,
        gender: form.gender,
        mobile: form.mobile.trim(),
        address: form.address.trim(),
        weight: numOrNull(form.weight),
        height: numOrNull(form.height),
        bloodGroup: form.bloodGroup,
        allergies: form.allergies.trim(),
        medicalHistory: form.medicalHistory.trim(),
      };
      const res = patient
        ? await api.updatePatient(patient.id, payload)
        : await api.createPatient(payload);
      toast.success(t("saved"));
      onSuccess?.(res.patient);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{patient ? t("editPatient") : t("registerPatient")}</DialogTitle>
          <DialogDescription>{pl("formHint", lang)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="pf-name">
              {t("name")} <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pf-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("name")}
            />
          </div>

          {/* Age years / months */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pf-age-years">
                {t("age")} ({t("years")})
              </Label>
              <Input
                id="pf-age-years"
                type="number"
                min={0}
                inputMode="numeric"
                value={form.ageYears}
                onChange={(e) => set("ageYears", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-age-months">{t("months")}</Label>
              <Input
                id="pf-age-months"
                type="number"
                min={0}
                max={11}
                inputMode="numeric"
                value={form.ageMonths}
                onChange={(e) => set("ageMonths", e.target.value)}
              />
            </div>
          </div>

          {/* DOB + gender */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pf-dob">
                {t("dateOfBirth")}{" "}
                <span className="text-xs font-normal text-slate-400">({pl("optional", lang)})</span>
              </Label>
              <Input
                id="pf-dob"
                type="date"
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("gender")}</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("gender")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{t("male")}</SelectItem>
                  <SelectItem value="FEMALE">{t("female")}</SelectItem>
                  <SelectItem value="OTHER">{t("other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mobile + blood group */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pf-mobile">{t("mobile")}</Label>
              <Input
                id="pf-mobile"
                type="tel"
                value={form.mobile}
                onChange={(e) => set("mobile", e.target.value)}
                placeholder="01XXXXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("bloodGroup")}</Label>
              <Select
                value={form.bloodGroup || BG_NONE}
                onValueChange={(v) => set("bloodGroup", v === BG_NONE ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("bloodGroup")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BG_NONE}>—</SelectItem>
                  {BLOOD_GROUPS.map((bg) => (
                    <SelectItem key={bg} value={bg}>
                      {bg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weight + height */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pf-weight">{t("weight")}</Label>
              <Input
                id="pf-weight"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={form.weight}
                onChange={(e) => set("weight", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-height">{t("height")}</Label>
              <Input
                id="pf-height"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={form.height}
                onChange={(e) => set("height", e.target.value)}
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="pf-address">{t("address")}</Label>
            <Input
              id="pf-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          {/* Allergies */}
          <div className="space-y-2">
            <Label htmlFor="pf-allergies">{t("allergies")}</Label>
            <Textarea
              id="pf-allergies"
              rows={2}
              value={form.allergies}
              onChange={(e) => set("allergies", e.target.value)}
            />
          </div>

          {/* Medical history */}
          <div className="space-y-2">
            <Label htmlFor="pf-history">{t("medicalHistory")}</Label>
            <Textarea
              id="pf-history"
              rows={3}
              value={form.medicalHistory}
              onChange={(e) => set("medicalHistory", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PatientFormDialog;
