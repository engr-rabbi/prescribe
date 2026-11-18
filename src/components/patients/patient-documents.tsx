"use client";

// Patient documents (reports, lab results, X-ray / CT / MRI / ultrasound images, photos, prescription
// PDFs). In the Google build every file lives in Google Drive; this card only shows the registry.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, FolderOpen, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { api, blobToBase64, openStoredFile, type FileDTO } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { isRemote } from "@/lib/remote-client";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KINDS = [
  { key: "MEDICAL_REPORT", en: "Medical report", bn: "মেডিকেল রিপোর্ট" },
  { key: "LAB_REPORT", en: "Lab / test report", bn: "ল্যাব / টেস্ট রিপোর্ট" },
  { key: "XRAY", en: "X-ray", bn: "এক্স-রে" },
  { key: "CT_SCAN", en: "CT scan", bn: "সিটি স্ক্যান" },
  { key: "MRI", en: "MRI", bn: "এমআরআই" },
  { key: "ULTRASOUND", en: "Ultrasound", bn: "আল্ট্রাসাউন্ড" },
  { key: "PATIENT_PHOTO", en: "Patient photo", bn: "রোগীর ছবি" },
  { key: "OTHER_DOCUMENT", en: "Other document", bn: "অন্যান্য ডকুমেন্ট" },
] as const;

const KIND_LABEL: Record<string, { en: string; bn: string }> = {
  ...Object.fromEntries(KINDS.map((k) => [k.key, { en: k.en, bn: k.bn }])),
  PRESCRIPTION_PDF: { en: "Prescription PDF", bn: "প্রেসক্রিপশন PDF" },
  ATTACHMENT: { en: "Attachment", bn: "সংযুক্তি" },
};

const T = {
  title: { en: "Documents & reports", bn: "ডকুমেন্ট ও রিপোর্ট" },
  where: { en: "Stored in Google Drive", bn: "Google Drive-এ সংরক্ষিত" },
  whereLocal: { en: "Stored in this browser", bn: "এই ব্রাউজারে সংরক্ষিত" },
  upload: { en: "Upload", bn: "আপলোড" },
  empty: { en: "No documents yet.", bn: "এখনো কোনো ডকুমেন্ট নেই।" },
  view: { en: "View", bn: "দেখুন" },
  download: { en: "Download", bn: "ডাউনলোড" },
  del: { en: "Delete", bn: "মুছুন" },
  confirm: { en: "Delete this file? It will be moved to the Drive trash.", bn: "ফাইলটি মুছবেন? এটি Drive-এর ট্র্যাশে যাবে।" },
  tooBig: { en: "File is larger than 8 MB", bn: "ফাইল ৮ MB-এর বেশি বড়" },
  uploaded: { en: "File uploaded", bn: "ফাইল আপলোড হয়েছে" },
} as const;

function sizeLabel(n: number) {
  if (n > 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function PatientDocuments({ patientId }: { patientId: string }) {
  const { lang } = useI18n();
  const role = useAppStore((s) => s.user?.role);
  const [files, setFiles] = useState<FileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<string>("MEDICAL_REPORT");
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canDelete = role === "DOCTOR" || role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    try {
      const patientFiles = await api.listFiles("PATIENT", patientId);
      const { prescriptions } = await api.patientConsultations(patientId);
      const pdfLists = await Promise.all(prescriptions.map((p) => api.listFiles("PRESCRIPTION", p.id).catch(() => ({ files: [] as FileDTO[] }))));
      const all = [...patientFiles.files, ...pdfLists.flatMap((l) => l.files)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setFiles(all);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length) return;
    setUploading(true);
    try {
      for (const f of list) {
        if (f.size > 8 * 1024 * 1024) {
          toast.error(`${f.name}: ${T.tooBig[lang]}`);
          continue;
        }
        const dataBase64 = await blobToBase64(f);
        await api.uploadFile({
          kind,
          relatedType: "PATIENT",
          relatedId: patientId,
          name: f.name,
          mimeType: f.type || "application/octet-stream",
          dataBase64,
        });
        toast.success(`${f.name} — ${T[ "uploaded" ][lang]}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const act = async (f: FileDTO, mode: "view" | "download") => {
    setBusy(f.id);
    try {
      await openStoredFile(f.id, mode);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the file");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (f: FileDTO) => {
    if (!window.confirm(T.confirm[lang])) return;
    setBusy(f.id);
    try {
      await api.deleteFile(f.id);
      setFiles((cur) => cur.filter((x) => x.id !== f.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <FolderOpen className="size-4 text-teal-600" />
            {T.title[lang]}
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">{isRemote ? T.where[lang] : T.whereLocal[lang]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger size="sm" className="w-[180px]" aria-label="Document type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k[lang]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.dcm"
            onChange={(e) => void onPick(e)}
          />
          <Button size="sm" onClick={() => input.current?.click()} disabled={uploading} className="bg-teal-600 text-white hover:bg-teal-700">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {T.upload[lang]}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />…
          </div>
        ) : files.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{T.empty[lang]}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  {f.mimeType.startsWith("image/") ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900" title={f.name}>
                    {f.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(f.createdAt).toLocaleString()} · {sizeLabel(f.size)} · {f.ownerEmail || "system"}
                  </p>
                </div>
                <Badge variant="secondary" className="font-normal">
                  {(KIND_LABEL[f.kind] ?? { en: f.kind, bn: f.kind })[lang]}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" title={T.view[lang]} aria-label={T.view[lang]} disabled={busy === f.id} onClick={() => void act(f, "view")}>
                    {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" title={T.download[lang]} aria-label={T.download[lang]} disabled={busy === f.id} onClick={() => void act(f, "download")}>
                    <Download className="size-4" />
                  </Button>
                  {canDelete ? (
                    <Button variant="ghost" size="icon" title={T.del[lang]} aria-label={T.del[lang]} disabled={busy === f.id} onClick={() => void remove(f)} className="hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default PatientDocuments;
