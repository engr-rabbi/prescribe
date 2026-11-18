"use client";

// Prescription history list — search, filter by status, open / duplicate / delete.

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, FileText, Plus, Search, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import { useI18n, localizeDigits } from "@/lib/i18n";
import { formatDate } from "@/lib/rx-utils";
import type { PrescriptionDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const L = {
  searchRx: { en: "Search by patient name or Rx code…", bn: "রোগীর নাম বা প্রেসক্রিপশন কোড দিয়ে খুঁজুন…" },
  allStatus: { en: "All statuses", bn: "সব অবস্থা" },
  newRx: { en: "New Prescription", bn: "নতুন প্রেসক্রিপশন" },
  noRx: { en: "No prescriptions found", bn: "কোনো প্রেসক্রিপশন পাওয়া যায়নি" },
  rxCode: { en: "Rx Code", bn: "প্রেসক্রিপশন কোড" },
  doctor: { en: "Doctor", bn: "চিকিৎসক" },
  duplicated: { en: "Duplicated — edit the draft", bn: "অনুলিপি তৈরি — ড্রাফট সম্পাদনা করুন" },
  deleted: { en: "Prescription deleted", bn: "প্রেসক্রিপশন মুছে ফেলা হয়েছে" },
  confirmDeleteRx: { en: "Delete this draft prescription?", bn: "এই ড্রাফট প্রেসক্রিপশন মুছে ফেলবেন?" },
};

export function PrescriptionsListView() {
  const { t, lang } = useI18n();
  const openEditor = useAppStore((s) => s.openEditor);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PrescriptionDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 20;

  const fetchList = useCallback(
    async (query: string, st: string, pg: number) => {
      setLoading(true);
      try {
        const res = await api.listPrescriptions({
          q: query,
          status: st === "all" ? undefined : st,
          page: pg,
          limit,
        });
        setItems(res.items);
        setTotal(res.total);
      } catch {
        toast.error(t("error"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchList(q, status, 1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, status, fetchList]);

  const gotoPage = (p: number) => {
    setPage(p);
    fetchList(q, status, p);
  };

  const duplicate = async (id: string) => {
    try {
      const { prescription } = await api.duplicatePrescription(id);
      toast.success(L.duplicated[lang]);
      openEditor(prescription.id);
    } catch {
      toast.error(t("error"));
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await api.deletePrescription(deleteId);
      toast.success(L.deleted[lang]);
      fetchList(q, status, page);
    } catch {
      toast.error(t("error"));
    } finally {
      setDeleteId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("rxHistory")}</h1>
          <p className="text-sm text-muted-foreground">
            {localizeDigits(total, lang)} {t("totalRecords")}
          </p>
        </div>
        <Button onClick={() => openEditor(null, null)} className="bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="mr-2 h-4 w-4" /> {L.newRx[lang]}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.searchRx[lang]} className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L.allStatus[lang]}</SelectItem>
            <SelectItem value="DRAFT">{t("draft")}</SelectItem>
            <SelectItem value="FINALIZED">{t("finalized")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <FileText className="h-10 w-10" />
              <p>{L.noRx[lang]}</p>
            </div>
          ) : (
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">{t("rxCode")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("patient")}</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">{t("doctor")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("date")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("status")}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((rx) => (
                    <tr key={rx.id} className="border-t hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-mono text-xs">{rx.code}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{rx.patient?.name}</div>
                        <div className="text-xs text-muted-foreground">{rx.patient?.code}</div>
                      </td>
                      <td className="hidden px-4 py-2.5 md:table-cell">{rx.doctor?.fullName}</td>
                      <td className="px-4 py-2.5 text-xs">{formatDate(rx.prescriptionDate)}</td>
                      <td className="px-4 py-2.5">
                        {rx.status === "FINALIZED" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            {t("finalized")}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{t("draft")}</Badge>
                        )}
                        {rx.version > 1 && (
                          <Badge variant="outline" className="ml-1">
                            v{localizeDigits(rx.version, lang)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title={t("view")} onClick={() => openEditor(rx.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t("duplicate")} onClick={() => duplicate(rx.id)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          {rx.status === "DRAFT" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("delete")}
                              className="text-destructive"
                              onClick={() => setDeleteId(rx.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>
            {localizeDigits(page - 1, lang)}
          </Button>
          <span className="text-muted-foreground">
            {localizeDigits(page, lang)} / {localizeDigits(totalPages, lang)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => gotoPage(page + 1)}>
            {localizeDigits(page + 1, lang)}
          </Button>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{L.confirmDeleteRx[lang]}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDelete")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={remove}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PrescriptionsListView;
