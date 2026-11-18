"use client";

// Patient selection for the prescription editor: searchable combobox over
// api.listPatients + a "New patient" quick-register mini-form (name, age,
// gender, mobile only) and a selected-patient summary card with allergy
// warning.

import * as React from "react";
import {
  AlertTriangleIcon,
  DropletsIcon,
  Loader2Icon,
  PhoneIcon,
  SaveIcon,
  UserPlusIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { PatientDTO } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatPatientAge } from "@/lib/rx-utils";
import { usePrescriptionStore } from "@/store/prescription-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchCombobox,
  type ComboboxOption,
} from "@/components/combobox/search-combobox";

const L = {
  newPatient: { en: "New patient", bn: "নতুন রোগী" },
  yearsShort: { en: "yrs", bn: "বছর" },
  allergiesWarn: { en: "Allergies", bn: "অ্যালার্জি" },
  bloodGroup: { en: "Blood", bn: "রক্ত" },
};

export interface PatientPickerProps {
  disabled?: boolean;
}

export function PatientPicker({ disabled }: PatientPickerProps) {
  const { lang, t } = useI18n();
  const patient = usePrescriptionStore((s) => s.patient);
  const setPatient = usePrescriptionStore((s) => s.setPatient);

  const [mode, setMode] = React.useState<"search" | "register">("search");
  const [name, setName] = React.useState("");
  const [age, setAge] = React.useState("");
  const [gender, setGender] = React.useState("Male");
  const [mobile, setMobile] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const loadPatients = React.useCallback(
    async (q: string): Promise<ComboboxOption<PatientDTO>[]> => {
      const res = await api.listPatients(q, 1, 8);
      return res.items.map((p) => ({
        value: p.id,
        label: p.name,
        secondary: [p.code, formatPatientAge(p), p.gender, p.mobile]
          .filter(Boolean)
          .join(" • "),
        item: p,
      }));
    },
    []
  );

  const register = async () => {
    if (!name.trim() || !mobile.trim()) {
      toast.error(t("required"));
      return;
    }
    setCreating(true);
    try {
      const res = await api.createPatient({
        name: name.trim(),
        ageYears: age ? Number(age) : undefined,
        gender,
        mobile: mobile.trim(),
      });
      setPatient(res.patient);
      toast.success(t("saved"));
      setMode("search");
      setName("");
      setAge("");
      setMobile("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setCreating(false);
    }
  };

  if (mode === "register") {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-teal-600/40 bg-teal-50/40 p-2 dark:bg-teal-950/20">
        <div className="text-xs font-semibold text-teal-700 dark:text-teal-400">{L.newPatient[lang]}</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("name")}
            className="h-8 text-sm"
            autoFocus
          />
          <Input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder={t("mobile")}
            className="h-8 text-sm"
            inputMode="tel"
          />
          <Input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder={`${t("age")} (${L.yearsShort[lang]})`}
            className="h-8 text-sm"
            inputMode="numeric"
          />
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">{t("male")}</SelectItem>
              <SelectItem value="Female">{t("female")}</SelectItem>
              <SelectItem value="Other">{t("other")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 bg-teal-600 text-white hover:bg-teal-700"
            onClick={() => void register()}
            disabled={creating}
          >
            {creating ? <Loader2Icon className="size-3.5 animate-spin" /> : <SaveIcon className="size-3.5" />}
            {t("save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setMode("search")}>
            <XIcon className="size-3.5" />
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <SearchCombobox<PatientDTO>
        placeholder={t("selectPatient")}
        icon={<UserRoundIcon className="size-3.5 shrink-0 opacity-50" />}
        value={patient ? `${patient.name} (${patient.code})` : undefined}
        loadOptions={loadPatients}
        onSelect={(o) => {
          if (o.item) setPatient(o.item);
        }}
        emptyText={t("noPatients")}
        disabled={disabled}
      />
      {!patient ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-teal-700 dark:text-teal-400"
          onClick={() => setMode("register")}
          disabled={disabled}
        >
          <UserPlusIcon className="size-3.5" />
          {L.newPatient[lang]}
        </Button>
      ) : (
        <div className="rounded-md border bg-muted/30 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{patient.name}</span>
            <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
              {patient.code}
            </Badge>
            <button
              type="button"
              className="ml-auto shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setPatient(null)}
              disabled={disabled}
              title={t("cancel")}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {formatPatientAge(patient) ? <span>{formatPatientAge(patient)}</span> : null}
            <span>{patient.gender}</span>
            {patient.mobile ? (
              <span className="inline-flex items-center gap-0.5">
                <PhoneIcon className="size-3" />
                {patient.mobile}
              </span>
            ) : null}
            {patient.bloodGroup ? (
              <span className="inline-flex items-center gap-0.5">
                <DropletsIcon className="size-3" />
                {L.bloodGroup[lang]} {patient.bloodGroup}
              </span>
            ) : null}
          </div>
          {patient.allergies ? (
            <div className="mt-1 flex items-start gap-1 rounded-sm bg-amber-50 px-1.5 py-1 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold">{L.allergiesWarn[lang]}:</span> {patient.allergies}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default PatientPicker;
