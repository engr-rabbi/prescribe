"use client";

// Preview toolbar: template selector + Print + Download PDF actions.
// Print uses the global print stylesheet which isolates #print-root.

import { useState } from "react";
import { CloudUpload, FileDown, Loader2, Printer, SwatchBook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePrescriptionStore } from "@/store/prescription-store";
import { TEMPLATE_META } from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { isRemote } from "@/lib/remote-client";
import { useAppStore } from "@/store/app-store";

export function PrintActions({ className }: { className?: string }) {
  const template = usePrescriptionStore((s) => s.template);
  const setTemplate = usePrescriptionStore((s) => s.setTemplate);
  const { t, lang } = useI18n();
  const prescriptionId = usePrescriptionStore((s) => s.prescriptionId);
  const status = usePrescriptionStore((s) => s.status);
  const code = usePrescriptionStore((s) => s.code);
  const version = usePrescriptionStore((s) => s.version);
  const role = useAppStore((s) => s.user?.role);
  const [saving, setSaving] = useState(false);
  const canSavePdf = status === "FINALIZED" && !!prescriptionId && !!code && role !== "ASSISTANT";

  const handleSavePdf = async () => {
    if (!prescriptionId || !code) return;
    setSaving(true);
    try {
      const { savePrescriptionPdf } = await import("@/lib/pdf-export");
      await savePrescriptionPdf(prescriptionId, code, version ?? 1);
      toast.success(lang === "bn" ? "PDF সংরক্ষিত হয়েছে" : isRemote ? "PDF saved to Google Drive" : "PDF saved to patient documents");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    toast.info(
      lang === "bn"
        ? "প্রিন্ট ডায়ালগে 'Save as PDF' বেছে নিন"
        : "Choose 'Save as PDF' in the print dialog"
    );
    window.print();
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`} data-slot="print-actions">
      <div className="flex items-center gap-1.5">
        <SwatchBook className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium text-muted-foreground">{t("template")}</span>
      </div>
      <Select value={template} onValueChange={(v) => setTemplate(v)}>
        <SelectTrigger size="sm" className="w-[200px]" aria-label={t("template")}>
          <SelectValue placeholder={t("template")} />
        </SelectTrigger>
        <SelectContent>
          {TEMPLATE_META.map((meta) => (
            <SelectItem key={meta.key} value={meta.key}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.key === "modern" ? "#0f766e" : meta.key === "clinical" ? "#1e3a5f" : "#57534e" }}
                  aria-hidden
                />
                {lang === "bn" ? meta.nameBn : meta.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ms-auto flex items-center gap-2">
        {canSavePdf ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void handleSavePdf()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CloudUpload className="size-4" aria-hidden />}
            {lang === "bn" ? (isRemote ? "Drive-এ PDF" : "PDF সংরক্ষণ") : isRemote ? "Save PDF to Drive" : "Save PDF"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="size-4" aria-hidden />
          {t("print")}
        </Button>
        <Button type="button" size="sm" onClick={handleDownloadPdf}>
          <FileDown className="size-4" aria-hidden />
          {t("downloadPdf")}
        </Button>
      </div>
    </div>
  );
}

export default PrintActions;
