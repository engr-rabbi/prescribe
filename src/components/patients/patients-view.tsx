"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  Pencil,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { localizeDigits, useI18n } from "@/lib/i18n";
import type { PatientDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  genderText,
  localAge,
  localDate,
  pl,
  THIN_SCROLL,
} from "@/components/patients/labels";
import { PatientDetailsView } from "@/components/patients/patient-details-view";
import { PatientFormDialog } from "@/components/patients/patient-form-dialog";

export interface PatientsViewProps {
  /** When provided, the details view for this patient opens automatically. */
  initialPatientId?: string | null;
}

const PAGE_SIZE = 20;

export function PatientsView({ initialPatientId }: PatientsViewProps) {
  const { t, lang } = useI18n();
  const { openEditor } = useAppStore();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PatientDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PatientDTO | null>(null);

  // Debounce search input (300 ms) and reset to first page.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listPatients(debounced, page, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setLoading(false);
    }
  }, [debounced, page, t]);

  useEffect(() => {
    void fetchPatients();
  }, [fetchPatients]);

  // Auto-open details when an initial patient id is provided.
  useEffect(() => {
    if (initialPatientId) setSelectedId(initialPatientId);
  }, [initialPatientId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const openRegister = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (p: PatientDTO) => {
    setEditing(p);
    setFormOpen(true);
  };

  if (selectedId) {
    return (
      <PatientDetailsView
        patientId={selectedId}
        onBack={() => {
          setSelectedId(null);
          void fetchPatients();
        }}
      />
    );
  }

  const renderActions = (p: PatientDTO, compact = false) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-slate-500 hover:bg-teal-50 hover:text-teal-700"
        onClick={() => setSelectedId(p.id)}
        title={t("view")}
        aria-label={t("view")}
      >
        <Eye className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-slate-500 hover:bg-teal-50 hover:text-teal-700"
        onClick={() => openEdit(p)}
        title={t("edit")}
        aria-label={t("edit")}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-teal-600 hover:bg-teal-50 hover:text-teal-700"
        onClick={() => openEditor(null, p.id)}
        title={compact ? pl("newRx", lang) : t("newPrescription")}
        aria-label={compact ? pl("newRx", lang) : t("newPrescription")}
      >
        <FilePlus2 className="size-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{t("patients")}</h1>
          <Badge variant="secondary">
            {localizeDigits(total, lang)} {t("totalRecords")}
          </Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPatients")}
              className="w-full pl-9 sm:w-72"
            />
          </div>
          <Button
            onClick={openRegister}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            <UserPlus className="size-4" />
            {t("registerPatient")}
          </Button>
        </div>
      </div>

      {/* List */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-teal-50">
                <Users className="size-6 text-teal-600" />
              </span>
              <p className="text-sm text-slate-500">{t("noPatients")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={openRegister}
                className="border-teal-200 text-teal-700 hover:bg-teal-50"
              >
                <UserPlus className="size-4" />
                {t("registerPatient")}
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className={cn("hidden overflow-x-auto md:block", THIN_SCROLL)}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{pl("code", lang)}</TableHead>
                      <TableHead>{t("name")}</TableHead>
                      <TableHead>{t("age")}</TableHead>
                      <TableHead>{t("gender")}</TableHead>
                      <TableHead>{t("mobile")}</TableHead>
                      <TableHead>{t("bloodGroup")}</TableHead>
                      <TableHead>{pl("rxCount", lang)}</TableHead>
                      <TableHead>{pl("lastVisit", lang)}</TableHead>
                      <TableHead className="text-right">{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((p) => (
                      <TableRow key={p.id} className="hover:bg-slate-50">
                        <TableCell className="whitespace-nowrap font-mono text-xs text-slate-500">
                          {p.code}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate font-medium text-slate-900">
                          {p.name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{localAge(p, lang)}</TableCell>
                        <TableCell>{genderText(p.gender, t)}</TableCell>
                        <TableCell className="whitespace-nowrap">{p.mobile || "—"}</TableCell>
                        <TableCell>{p.bloodGroup || "—"}</TableCell>
                        <TableCell>
                          {localizeDigits(p.prescriptionCount ?? 0, lang)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {localDate(p.lastVisit, lang)}
                        </TableCell>
                        <TableCell>{renderActions(p)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="divide-y divide-slate-100 md:hidden">
                {items.map((p) => (
                  <div key={p.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                        <p className="font-mono text-xs text-slate-500">{p.code}</p>
                      </div>
                      {p.bloodGroup ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-teal-200 text-xs text-teal-700"
                        >
                          {p.bloodGroup}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span>
                        {t("age")}: {localAge(p, lang)}
                      </span>
                      <span>{genderText(p.gender, t)}</span>
                      <span className="truncate">{p.mobile || "—"}</span>
                      <span>
                        {pl("rxCount", lang)}: {localizeDigits(p.prescriptionCount ?? 0, lang)}
                      </span>
                      <span className="col-span-2">
                        {pl("lastVisit", lang)}: {localDate(p.lastVisit, lang)}
                      </span>
                    </div>
                    {renderActions(p, true)}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
                <p className="text-xs text-slate-500">
                  {localizeDigits(from, lang)}–{localizeDigits(to, lang)} /{" "}
                  {localizeDigits(total, lang)} {t("totalRecords")}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="border-teal-200 text-teal-700 hover:bg-teal-50"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-xs text-slate-500">
                    {localizeDigits(page, lang)} / {localizeDigits(totalPages, lang)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="border-teal-200 text-teal-700 hover:bg-teal-50"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Register / edit dialog */}
      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patient={editing}
        onSuccess={() => {
          void fetchPatients();
        }}
      />
    </div>
  );
}

export default PatientsView;
