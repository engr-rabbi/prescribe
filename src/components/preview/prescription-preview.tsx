"use client";

// Live A4 prescription preview.
// Renders the selected template inside a fixed 794px (96dpi A4) sheet and
// auto-fits it to the available container width via a CSS transform scale.
// The sheet carries id="print-root" so the print stylesheet can isolate it.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrescriptionStore } from "@/store/prescription-store";
import { api } from "@/lib/api-client";
import { DEFAULT_TEMPLATE_CONFIG, type ChamberDTO, type TemplateConfig } from "@/lib/types";
import { formatDate, parseJSONSafe } from "@/lib/rx-utils";
import { localizeDigits, useI18n } from "@/lib/i18n";
import ModernTemplate from "./templates/modern-template";
import ClinicalTemplate from "./templates/clinical-template";
import ClassicTemplate from "./templates/classic-template";
import type { TemplateProps } from "./preview-types";

export const A4_WIDTH = 794; // px at 96dpi
const A4_HEIGHT = 1123; // px at 96dpi

export function PrescriptionPreview({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(A4_HEIGHT);
  const [chambers, setChambers] = useState<ChamberDTO[]>([]);

  const { data, doctor, patient, code, status, version, template, templateConfig, prescriptionDate, chamberId } =
    usePrescriptionStore();
  const { lang } = useI18n();

  // Chambers are optional; resolve the prescription's chamber (selected or primary).
  useEffect(() => {
    let cancelled = false;
    api
      .listChambers()
      .then((res) => {
        if (!cancelled) setChambers(res.chambers ?? []);
      })
      .catch(() => {
        /* chambers are optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Doctor's saved config merged over defaults (accentColor overrides default accent).
  const config: TemplateConfig = {
    ...DEFAULT_TEMPLATE_CONFIG,
    ...parseJSONSafe<Partial<TemplateConfig>>(templateConfig, {}),
  };

  // Loaded prescriptions keep their original date; new ones show today.
  const dateText = prescriptionDate
    ? formatDate(prescriptionDate)
    : formatDate(new Date().toISOString());

  // Auto-fit: measure container width + sheet height with a ResizeObserver.
  const measure = useCallback(() => {
    const container = containerRef.current;
    const sheet = sheetRef.current;
    if (container) setScale(Math.min(1, container.clientWidth / A4_WIDTH));
    if (sheet) setSheetHeight(sheet.offsetHeight || A4_HEIGHT);
  }, []);

  useEffect(() => {
    measure();
    const container = containerRef.current;
    const sheet = sheetRef.current;
    if (!container || !sheet) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [measure]);

  const Template =
    template === "clinical" ? ClinicalTemplate : template === "classic" ? ClassicTemplate : ModernTemplate;

  const chamber =
    chambers.find((c) => c.id === chamberId) ?? chambers.find((c) => c.isPrimary) ?? null;

  const props: TemplateProps = {
    data,
    doctor,
    patient,
    chamber,
    code: code || "",
    status,
    dateText: localizeDigits(dateText, lang),
    config,
    lang,
    version,
  };

  return (
    <div ref={containerRef} className={className}>
      <div
        className="a4-scale-wrap"
        style={{
          width: A4_WIDTH,
          height: Math.round(sheetHeight * scale),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div ref={sheetRef} id="print-root" className="a4-sheet mx-auto">
          <Template {...props} />
        </div>
      </div>
    </div>
  );
}

export default PrescriptionPreview;
