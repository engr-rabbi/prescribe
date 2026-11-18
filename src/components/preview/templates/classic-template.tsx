"use client";

// Classic Medical — serif typography, traditional Rx pad: doctor name top-left,
// Reg No below, logo top-right, double rule, dotted patient fields and
// dotted-leader medicine lines (1. Tab. NAPA 500 mg ..... 1+0+1 — 7 days).

import type { ReactNode } from "react";
import { useI18n, localizeDigits } from "@/lib/i18n";
import { formatDate } from "@/lib/rx-utils";
import {
  bnStyle,
  chamberDisplay,
  classicMedicineDetail,
  doctorDegrees,
  doctorRegLine,
  medicineName,
  nonEmptyHistory,
  orderedDiagnosis,
  patientBarInfo,
  vitalEntries,
  SERIF_STACK,
  type TemplateProps,
} from "../preview-types";

const Rx = "℞";

function SerifHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-[13px] font-bold text-stone-900 underline decoration-stone-400 underline-offset-4">{children}</h3>;
}

function DottedField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex min-w-0 items-baseline gap-1.5 ${className ?? ""}`}>
      <span className="shrink-0 text-stone-600">{label}</span>
      <span className="min-w-[60px] flex-1 border-b border-dotted border-stone-500 pb-px font-bold text-stone-900">
        {value || "\u00A0"}
      </span>
    </div>
  );
}

export function ClassicTemplate({ data, doctor, patient, chamber, code, status, dateText, config, lang }: TemplateProps) {
  const { t } = useI18n();
  const accent = config.accentColor || "#0f766e";
  const D = (s: string) => localizeDigits(s, lang);
  const serifBn = bnStyle(SERIF_STACK);

  const bar = patientBarInfo(data, patient);
  const vitals = vitalEntries(data.vitals);
  const history = nonEmptyHistory(data.history);
  const diagnosis = orderedDiagnosis(data);
  const showLogo = config.showLogo !== false;

  const fullName = doctor?.fullName?.trim() || "—";
  const degrees = doctorDegrees(doctor);
  const regLine = doctorRegLine(doctor);
  const ch = chamberDisplay(chamber, doctor);

  return (
    <div
      className="sheet-body relative flex min-h-[1123px] flex-col px-10 pt-8 pb-6 text-[12.5px] leading-[1.5] text-stone-800"
      style={serifBn}
    >
      {config.showWatermark && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <span className="text-[300px] leading-none select-none" style={{ color: accent, opacity: 0.05 }}>
            {Rx}
          </span>
        </div>
      )}

      {/* ---------------- Header (traditional) ---------------- */}
      <header className="relative z-10">
        <div className="flex items-start justify-between gap-6">
          {/* left: name, degrees, reg no */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] leading-tight font-bold text-stone-900" style={{ color: accent }}>
              {fullName}
            </h1>
            {degrees ? <div className="mt-0.5 text-[12.5px] text-stone-700 italic">{degrees}</div> : null}
            {doctor?.designation ? <div className="mt-0.5 text-[12px] text-stone-600">{doctor.designation}</div> : null}
            {!ch.name && doctor?.hospitalName ? <div className="mt-0.5 text-[12px] text-stone-600">{doctor.hospitalName}</div> : null}
            {regLine ? <div className="mt-0.5 text-[12px] font-semibold text-stone-800">{regLine}</div> : null}
          </div>

          {/* right: logo or caduceus + chamber/phone */}
          <div className="shrink-0 text-right">
            {showLogo ? (
              doctor?.logoUrl ? (
                <img src={doctor.logoUrl} alt="" className="ml-auto mb-1 h-14 w-auto object-contain" />
              ) : (
                <div
                  className="ml-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full border-2 text-[24px]"
                  style={{ borderColor: accent, color: accent }}
                  aria-hidden
                >
                  ⚕
                </div>
              )
            ) : null}
            <div className="text-[11px] text-stone-600" style={serifBn}>
              {ch.name ? (
                <div className="text-[14px] leading-tight font-bold text-stone-900">{ch.name}</div>
              ) : null}
              {doctor?.phone ? <div>Phone: {doctor.phone}</div> : null}
              {ch.name
                ? ch.detailLines.map((l, i) => (
                    <div key={i} className="text-[10.5px] text-stone-500">
                      {l}
                    </div>
                  ))
                : ch.legacyLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>

        {/* double rule */}
        <div className="mt-2.5 border-t-[3px] border-double border-stone-800" />
      </header>

      {/* ---------------- Patient row (dotted fields) ---------------- */}
      <div className="relative z-10 mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5" style={serifBn}>
        <DottedField label="Name:" value={bar.name} className="min-w-[220px] flex-[2]" />
        <DottedField label="Age/Sex:" value={[D(bar.age), bar.sex].filter(Boolean).join(" / ")} className="min-w-[140px] flex-1" />
        <DottedField label="Wt.:" value={D(bar.weight)} className="min-w-[90px] flex-1" />
        <DottedField label="Date:" value={D(dateText)} className="min-w-[130px] flex-1" />
      </div>

      {/* ---------------- Body ---------------- */}
      <div className="relative z-10 mt-4 flex flex-1 gap-6">
        {/* LEFT column */}
        <div className="w-[36%] shrink-0 space-y-4">
          {data.chiefComplaints.length > 0 && (
            <section>
              <SerifHeading>C/C</SerifHeading>
              <ul className="mt-1 space-y-1" style={serifBn}>
                {data.chiefComplaints.map((c) => (
                  <li key={c.id}>
                    <span>{c.label}</span>
                    {c.severity?.trim() ? <span className="text-stone-600"> ({c.severity.trim()})</span> : null}
                    {c.duration?.trim() ? <span className="text-stone-600 italic"> — {c.duration.trim()}</span> : null}
                    {c.details?.trim() ? <div className="text-[11.5px] text-stone-500 italic">{c.details.trim()}</div> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 0 && (
            <section>
              <SerifHeading>H/O</SerifHeading>
              <ul className="mt-1 space-y-1" style={serifBn}>
                {history.map((h) => (
                  <li key={h.short}>
                    <span className="font-semibold">{h.short}:</span> <span className="text-stone-700">{h.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(vitals.length > 0 || data.examinations.length > 0) && (
            <section>
              <SerifHeading>O/E</SerifHeading>
              {vitals.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {vitals.map((v) => (
                    <div key={v.label}>
                      <span className="font-semibold">{v.label}</span> = {D(v.value)}
                    </div>
                  ))}
                </div>
              )}
              {data.examinations.length > 0 && (
                <ul className="mt-1 space-y-0.5" style={serifBn}>
                  {data.examinations.map((e) => (
                    <li key={e.id}>
                      <span className="font-semibold">{e.label}</span>
                      {e.value?.trim() ? <span> = {e.value.trim()}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {data.investigations.length > 0 && (
            <section>
              <SerifHeading>{t("investigations")}</SerifHeading>
              <ul className="mt-1 list-disc space-y-0.5 pl-5" style={serifBn}>
                {data.investigations.map((i) => (
                  <li key={i.id}>
                    {i.label}
                    {i.note?.trim() ? <span className="text-stone-500"> ({i.note.trim()})</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* vertical rule */}
        <div className="w-px shrink-0 bg-stone-300" />

        {/* RIGHT Rx column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span className="text-[40px] leading-[0.85] font-bold" style={{ color: accent }} aria-hidden>
              {Rx}
            </span>
            {diagnosis.length > 0 && (
              <div className="flex-1 pt-0.5" style={serifBn}>
                {diagnosis.map((d, idx) => (
                  <div key={d.id} className={idx === 0 ? "text-[14px] font-bold text-stone-900" : "text-[12.5px]"}>
                    {d.label}
                    {d.icd10?.trim() ? <span className="ml-1 text-[10px] font-normal text-stone-500">({d.icd10.trim()})</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.medicines.length > 0 && (
            <ol className="mt-4 space-y-2">
              {data.medicines.map((m, idx) => {
                const name = medicineName(m);
                const detail = classicMedicineDetail(m);
                return (
                  <li key={m._uid} className="flex items-baseline gap-1">
                    <span className="w-6 shrink-0 text-right">{idx + 1}.</span>
                    <span className="shrink-0 font-bold text-stone-900" style={serifBn}>
                      {name}
                    </span>
                    {detail ? (
                      <>
                        <span className="mx-1 min-w-[24px] flex-1 overflow-hidden border-b border-dotted border-stone-400" aria-hidden>
                          {"\u00A0"}
                        </span>
                        <span className="shrink-0 text-stone-800" style={serifBn}>
                          {detail}
                        </span>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}

          {data.advice.length > 0 && (
            <section className="mt-5">
              <SerifHeading>{t("advice")}</SerifHeading>
              <ul className="mt-1 list-disc space-y-0.5 pl-5" style={serifBn}>
                {data.advice.map((a) => (
                  <li key={a.id}>{a.label}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* ---------------- Footer ---------------- */}
      <footer className="relative z-10 mt-auto pt-4">
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-1 text-[12px] text-stone-700" style={serifBn}>
            {(data.followUp.date || data.followUp.note?.trim()) && (
              <div>
                <span className="font-bold text-stone-900">{t("nextVisit")}:</span>{" "}
                {data.followUp.date ? D(formatDate(data.followUp.date)) : ""}
                {data.followUp.note?.trim() ? (data.followUp.date ? " — " : "") + data.followUp.note.trim() : ""}
              </div>
            )}
            <div className="font-sans text-[10px] text-stone-400">
              {code ? `Rx No: ${code}` : "New prescription"}
              {status === "DRAFT" ? "  •  DRAFT" : ""}
            </div>
          </div>
          <div className="text-center">
            {doctor?.signatureUrl ? (
              <img src={doctor.signatureUrl} alt="" className="mx-auto mb-0.5 h-10 object-contain" />
            ) : (
              <div className="h-7" aria-hidden />
            )}
            <div className="min-w-[200px] border-t border-stone-500 pt-1 text-[13px] font-bold text-stone-900">{fullName}</div>
            {regLine ? <div className="text-[10.5px] text-stone-500">{regLine}</div> : null}
          </div>
        </div>
        {doctor?.footerNote?.trim() ? (
          <div className="mt-3 border-t border-dotted border-stone-400 pt-1 text-center text-[11px] text-stone-500 italic" style={serifBn}>
            {doctor.footerNote.trim()}
          </div>
        ) : null}
      </footer>
    </div>
  );
}

export default ClassicTemplate;
