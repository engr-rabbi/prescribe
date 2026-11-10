"use client";

import React, { useCallback, useEffect, useState } from "react";
import { PatientDocuments } from "@/components/patients/patient-documents";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Copy,
  Droplets,
  Eye,
  FilePlus2,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Ruler,
  Scale,
  Stethoscope,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { localizeDigits, useI18n } from "@/lib/i18n";
import type { PatientDTO, PrescriptionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  genderText,
  localAge,
  localDate,
  pl,
  statusBadgeClass,
  statusLabel,
  THIN_SCROLL,
} from "@/components/patients/labels";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";

export interface PatientDetailsViewProps {
  patientId: string;
  onBack: () => void;
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0 text-teal-600" /> : null}
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="break-words text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function PatientDetailsView({ patientId, onBack }: PatientDetailsViewProps) {
  const { t, lang } = useI18n();
  const { openEditor } = useAppStore();
  const [patient, setPatient] = useState<PatientDTO | null>(null);
  const [consultations, setConsultations] = useState<PrescriptionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<PrescriptionDTO | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.getPatient(patientId),
        api.patientConsultations(patientId),
      ]);
      setPatient(pRes.patient);
      setConsultations(cRes.prescriptions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [patientId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDuplicate = async () => {
    if (!duplicateTarget) return;
    setDuplicating(true);
    try {
      const res = await api.duplicatePrescription(duplicateTarget.id);
      toast.success(pl("duplicated", lang));
      setDuplicateTarget(null);
      openEditor(res.prescription.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="space-y-6">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="border-teal-200 text-teal-700 hover:bg-teal-50"
        >
          <ArrowLeft className="size-4" />
          {t("patients")}
        </Button>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {t("noResults")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="border-teal-200 text-teal-700 hover:bg-teal-50"
        >
          <ArrowLeft className="size-4" />
          {t("patients")}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            <Pencil className="size-4" />
            {t("edit")}
          </Button>
          <Button
            size="sm"
            onClick={() => openEditor(null, patient.id)}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            <FilePlus2 className="size-4" />
            {t("newConsultation")}
          </Button>
        </div>
      </div>

      {/* Header card */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-teal-100 text-base font-semibold text-teal-700">
              {initialsOf(patient.name) || "?"}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-slate-900">{patient.name}</h2>
                <Badge variant="outline" className="font-mono text-xs text-teal-700">
                  {patient.code}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {genderText(patient.gender, t)}
                {localAge(patient, lang) !== "—" ? ` • ${localAge(patient, lang)}` : ""}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field icon={Phone} label={t("mobile")} value={patient.mobile || "—"} />
            <Field icon={MapPin} label={t("address")} value={patient.address || pl("notRecorded", lang)} />
            <Field
              icon={Droplets}
              label={t("bloodGroup")}
              value={patient.bloodGroup || "—"}
            />
            <Field
              icon={Scale}
              label={t("weight")}
              value={
                patient.weight != null
                  ? `${localizeDigits(patient.weight, lang)} kg`
                  : "—"
              }
            />
            <Field
              icon={Ruler}
              label={t("height")}
              value={
                patient.height != null
                  ? `${localizeDigits(patient.height, lang)} cm`
                  : "—"
              }
            />
            <Field
              icon={CalendarDays}
              label={pl("registered", lang)}
              value={localDate(patient.createdAt, lang)}
            />
          </div>

          {patient.allergies ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{t("allergies")}</p>
                <p className="text-sm text-amber-700">{patient.allergies}</p>
              </div>
            </div>
          ) : null}

          {patient.medicalHistory ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">{t("medicalHistory")}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">
                {patient.medicalHistory}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Consultation history */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <ClipboardList className="size-4 text-teal-600" />
            {t("consultationHistory")}
            <Badge variant="secondary" className="ml-1">
              {localizeDigits(consultations.length, lang)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {consultations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-teal-50">
                <Stethoscope className="size-5 text-teal-600" />
              </span>
              <p className="text-sm text-slate-500">{pl("noConsultations", lang)}</p>
              <Button
                size="sm"
                onClick={() => openEditor(null, patient.id)}
                className="mt-1 bg-teal-600 text-white hover:bg-teal-700"
              >
                <FilePlus2 className="size-4" />
                {t("newConsultation")}
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "max-h-96 divide-y divide-slate-100 overflow-y-auto",
                THIN_SCROLL
              )}
            >
              {consultations.map((rx) => (
                <div
                  key={rx.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      <span className="font-mono text-xs text-slate-500">{rx.code}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {rx.doctor?.fullName || "—"} •{" "}
                      {localizeDigits(rx.medicines?.length ?? 0, lang)} {t("medicines")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      {localDate(rx.prescriptionDate, lang)}
                    </span>
                    <Badge className={statusBadgeClass(rx.status)}>
                      {statusLabel(rx.status, t)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 border-teal-200 text-teal-700 hover:bg-teal-50"
                      onClick={() => openEditor(rx.id)}
                      title={pl("open", lang)}
                      aria-label={pl("open", lang)}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-slate-500 hover:bg-slate-100"
                      onClick={() => setDuplicateTarget(rx)}
                      title={t("duplicate")}
                      aria-label={t("duplicate")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSuccess={(updated) => setPatient(updated)}
      />

      <PatientDocuments patientId={patient.id} />

      {/* Duplicate confirmation */}
      <AlertDialog
        open={duplicateTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDuplicateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("duplicate")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pl("duplicateConfirm", lang)}
              {duplicateTarget ? ` (${duplicateTarget.code})` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={duplicating}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDuplicate();
              }}
              disabled={duplicating}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {duplicating ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("duplicate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PatientDetailsView;
