"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  ChevronRight,
  FilePlus2,
  FileText,
  Eye,
  RefreshCw,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import { localizeDigits, useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { DashboardStats } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  localAge,
  localDate,
  pl,
  statusBadgeClass,
  statusLabel,
  THIN_SCROLL,
  type PLKey,
} from "@/components/patients/labels";

// Local labels for this view that are not present in the global DICT.
const L: Record<Lang, Record<string, string>> = {
  en: {
    dashboardTitle: "Dashboard",
    tagline: "Practice overview at a glance",
  },
  bn: {
    dashboardTitle: "ড্যাশবোর্ড",
    tagline: "এক নজরে আপনার প্র্যাকটিস",
  },
};
const dl = (key: string, lang: Lang): string => L[lang][key] ?? L.en[key] ?? key;

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  loading: boolean;
  tone: "teal" | "emerald";
}

function StatCard({ icon: Icon, label, value, loading, tone }: StatCardProps) {
  const { lang } = useI18n();
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            tone === "teal" ? "bg-teal-50 text-teal-700" : "bg-emerald-50 text-emerald-700"
          )}
        >
          <Icon className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-16" />
          ) : (
            <p className="text-2xl font-semibold text-slate-900">
              {localizeDigits(value, lang)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function DashboardView() {
  const { t, lang } = useI18n();
  const { setView, openEditor } = useAppStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.dashboard();
      setStats(res.stats);
    } catch (e) {
      setFailed(true);
      toast.error(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const pick = (key: PLKey): string => pl(key, lang);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{dl("dashboardTitle", lang)}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{dl("tagline", lang)}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label={t("totalPatients")}
          value={stats?.totalPatients ?? 0}
          loading={loading}
          tone="teal"
        />
        <StatCard
          icon={UserCheck}
          label={t("todayPatients")}
          value={stats?.todayPatients ?? 0}
          loading={loading}
          tone="emerald"
        />
        <StatCard
          icon={FileText}
          label={t("totalPrescriptions")}
          value={stats?.totalPrescriptions ?? 0}
          loading={loading}
          tone="teal"
        />
        <StatCard
          icon={CalendarCheck}
          label={t("todayPrescriptions")}
          value={stats?.todayPrescriptions ?? 0}
          loading={loading}
          tone="emerald"
        />
      </div>

      {/* Quick actions */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <CalendarClock className="size-4 text-teal-600" />
            {t("quickActions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => openEditor(null, null)}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            <FilePlus2 className="size-4" />
            {t("newPrescription")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setView("patients")}
            className="border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
          >
            <UserPlus className="size-4" />
            {t("registerPatient")}
          </Button>
        </CardContent>
      </Card>

      {/* Follow-ups + recent patients */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming follow-ups */}
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <CalendarClock className="size-4 text-teal-600" />
              {t("upcomingFollowUps")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <ListSkeleton />
            ) : failed ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <p className="text-sm text-slate-500">{t("error")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchStats()}
                  className="border-teal-200 text-teal-700 hover:bg-teal-50"
                >
                  <RefreshCw className="size-4" />
                  {pick("retry")}
                </Button>
              </div>
            ) : !stats || stats.upcomingFollowUps.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-teal-50">
                  <CalendarX2 className="size-5 text-teal-600" />
                </span>
                <p className="text-sm text-slate-500">{t("noFollowUps")}</p>
              </div>
            ) : (
              <div className={cn("max-h-64 overflow-y-auto", THIN_SCROLL)}>
                <Table>
                  <TableHeader className="sticky top-0 bg-white">
                    <TableRow>
                      <TableHead>{t("followUpDate")}</TableHead>
                      <TableHead>{t("patient")}</TableHead>
                      <TableHead>{pl("code", lang)}</TableHead>
                      <TableHead>{t("doctor")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.upcomingFollowUps.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="whitespace-nowrap font-medium text-teal-700">
                          {localDate(f.followUpDate, lang)}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate font-medium text-slate-900">
                          {f.patientName}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-500">
                          {f.patientCode}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-slate-600">
                          {f.doctorName}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent patients */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <Users className="size-4 text-teal-600" />
              {t("recentPatients")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <ListSkeleton rows={3} />
            ) : !stats || stats.recentPatients.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">{t("noResults")}</div>
            ) : (
              <div className={cn("max-h-64 divide-y divide-slate-100 overflow-y-auto", THIN_SCROLL)}>
                {stats.recentPatients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setView("patients")}
                    className="flex w-full items-center justify-between gap-2 px-6 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{p.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {p.code} • {localAge(p, lang)}
                        {p.mobile ? ` • ${p.mobile}` : ""}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {pl("lastVisit", lang)}: {localDate(p.lastVisit, lang)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent prescriptions */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <FileText className="size-4 text-teal-600" />
            {t("recentPrescriptions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <ListSkeleton />
          ) : !stats || stats.recentPrescriptions.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">{t("noResults")}</div>
          ) : (
            <div className={cn("max-h-80 divide-y divide-slate-100 overflow-y-auto", THIN_SCROLL)}>
              {stats.recentPrescriptions.map((rx) => (
                <div
                  key={rx.id}
                  className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      <span className="font-mono text-xs text-slate-500">{rx.code}</span>{" "}
                      — {rx.patientName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {rx.doctorName} • {localDate(rx.prescriptionDate, lang)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={statusBadgeClass(rx.status)}>
                      {statusLabel(rx.status, t)}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditor(rx.id)}
                      className="border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
                    >
                      <Eye className="size-3.5" />
                      {pick("open")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DashboardView;
