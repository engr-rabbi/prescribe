"use client";

// Admin → Backups & exports. Backups are full copies of the database spreadsheet kept in
// Drive → "System Backups"; exports are CSV files in Drive → "Exported Reports".

import React, { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { api, openStoredFile, type FileDTO } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { isRemote } from "@/lib/remote-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const T = {
  title: { en: "Backups & exports", bn: "ব্যাকআপ ও এক্সপোর্ট" },
  desc: {
    en: "Backups are full copies of the database in Google Drive → System Backups (also created automatically every night). Exports are CSV files in Exported Reports.",
    bn: "ব্যাকআপ হলো ডেটাবেসের পূর্ণ কপি (Google Drive → System Backups), প্রতি রাতে নিজে থেকেও তৈরি হয়। এক্সপোর্ট হলো Exported Reports-এ CSV ফাইল।",
  },
  descLocal: {
    en: "Local demo build: backups and exports are saved inside this browser.",
    bn: "লোকাল ডেমো: ব্যাকআপ ও এক্সপোর্ট এই ব্রাউজারেই সংরক্ষিত হয়।",
  },
  backup: { en: "Back up now", bn: "এখনই ব্যাকআপ নিন" },
  exports: { en: "Export", bn: "এক্সপোর্ট" },
  recent: { en: "Recent backups & exports", bn: "সাম্প্রতিক ব্যাকআপ ও এক্সপোর্ট" },
  none: { en: "Nothing yet.", bn: "এখনো কিছু নেই।" },
  done: { en: "Created", bn: "তৈরি হয়েছে" },
  openDrive: { en: "Open in Google Drive (Drive ID shown below)", bn: "Google Drive-এ খুলুন" },
} as const;

const ENTITIES = [
  { key: "patients", en: "Patients", bn: "রোগী" },
  { key: "prescriptions", en: "Prescriptions", bn: "প্রেসক্রিপশন" },
  { key: "audit-logs", en: "Audit logs", bn: "অডিট লগ" },
  { key: "users", en: "Users", bn: "ইউজার" },
] as const;

export function BackupsPanel() {
  const { lang } = useI18n();
  const [files, setFiles] = useState<FileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setFiles((await api.systemFiles()).files);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<{ file: FileDTO }>) => {
    setBusy(key);
    try {
      const { file } = await fn();
      toast.success(`${T.done[lang]}: ${file.name}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackup className="size-4 text-teal-600" />
          {T.title[lang]}
        </CardTitle>
        <CardDescription>{isRemote ? T.desc[lang] : T.descLocal[lang]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void run("backup", api.runBackup)} disabled={busy !== null} className="bg-teal-600 text-white hover:bg-teal-700">
            {busy === "backup" ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
            {T.backup[lang]}
          </Button>
          <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          {ENTITIES.map((e) => (
            <Button key={e.key} variant="outline" size="sm" disabled={busy !== null} onClick={() => void run(e.key, () => api.createExport(e.key))}>
              {busy === e.key ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              {T.exports[lang]} {e[lang]}
            </Button>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-900">{T.recent[lang]}</h4>
            <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
              <RefreshCw className="size-4" />
            </Button>
          </div>
          {loading ? (
            <Loader2 className="size-4 animate-spin text-slate-400" />
          ) : files.length === 0 ? (
            <p className="text-sm text-slate-500">{T.none[lang]}</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <Badge variant="secondary" className="font-normal">
                    {f.kind}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-xs text-slate-500">{new Date(f.createdAt).toLocaleString()}</span>
                  {f.driveFileId ? (
                    <code className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 md:inline" title={T.openDrive[lang]}>
                      {f.driveFileId}
                    </code>
                  ) : null}
                  {f.kind !== "BACKUP" || !isRemote ? (
                    <Button variant="ghost" size="icon" aria-label="Download" onClick={() => void openStoredFile(f.id, "download").catch((e) => toast.error(e.message))}>
                      <Download className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default BackupsPanel;
