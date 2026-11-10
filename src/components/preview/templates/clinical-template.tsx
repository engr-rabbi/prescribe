"use client";

// Clinical Detailed — split header, boxed section headings, vitals grid,
// denser typography, revision note for versions > 1.

import type { ReactNode } from "react";
import { useI18n, localizeDigits } from "@/lib/i18n";
import { formatDate } from "@/lib/rx-utils";
import {
  bnStyle,
  chamberDisplay,
  doctorDegrees,
  doctorRegLine,
  medicineDetail,
  medicineName,
  nonEmptyHistory,
  orderedDiagnosis,
  patientBarInfo,
  vitalEntries,
  BN_STACK,
  SANS_STACK,
  type TemplateProps,
} from "../preview-types";

const Rx = "℞";

function BoxHeading({ children, accent }: { children: ReactNode; accent: string }) {
  return (
    <div
      className="inline-block rounded-[3px] border px-2 py-[2px] text-[10px] font-bold tracking-[0.08em] uppercase"
      style={{ color: accent, borderColor: `${accent}66`, backgroundColor: `${accent}0f` }}
    >
      {children}
    </div>
  );
}

export function ClinicalTemplate({ data, doctor, patient, chamber, code, status, dateText, config, lang, version }: TemplateProps) {
  const { t } = useI18n();
  const accent = config.accentColor || "#0f766e";
  const D = (s: string) => localizeDigits(s, lang);

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
      className="sheet-body relative flex min-h-[1123px] flex-col px-8 pt-6 pb-5 text-[11.5px] leading-[1.4] text-stone-800"
      style={bnStyle(SANS_STACK)}
    >
      {config.showWatermark && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <span className="font-serif text-[280px] leading-none select-none" style={{ color: accent, opacity: 0.05 }}>
            {Rx}
          </span>
        </div>
      )}

      {/* ---------------- Header (split) ---------------- */}
      <header className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          {/* left: doctor identity */}
          <div className="flex flex-1 items-start gap-3">
            {config.showPhoto && doctor?.photoUrl ? (
              <img src={doctor.photoUrl} alt="" className="h-16 w-14 rounded border border-stone-200 object-cover" />
            ) : null}
            <div>
              <h1 className="text-[22px] leading-tight font-bold" style={{ color: accent }}>
                {fullName}
              </h1>
              {degrees ? <div className="mt-0.5 text-[11px] text-stone-700">{degrees}</div> : null}
              {doctor?.designation ? <div className="mt-0.5 text-[11px] text-stone-600">{doctor.designation}</div> : null}
              {regLine ? <div className="mt-0.5 text-[11px] font-semibold text-stone-700">{regLine}</div> : null}
              {!ch.name && doctor?.hospitalName ? (
                <div className="mt-0.5 text-[11px] text-stone-600" style={bnStyle(SANS_STACK)}>
                  {doctor.hospitalName}
                </div>
              ) : null}
            </div>
          </div>

          {/* center: logo / caduceus */}
          <div className="flex shrink-0 items-start pt-1">
            {showLogo ? (
              doctor?.logoUrl ? (
                <img src={doctor.logoUrl} alt="" className="h-14 w-auto object-contain" />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border text-[24px]"
                  style={{ borderColor: accent, color: accent }}
                  aria-hidden
                >
                  ⚕
                </div>
              )
            ) : null}
          </div>

          {/* right: chamber (name bold) + contacts */}
          <div className="flex-1 text-right text-[11px] text-stone-600" style={bnStyle(SANS_STACK)}>
            {ch.name ? (
              <div
                className="text-[14px] leading-tight font-bold text-stone-900"
                style={{ fontFamily: `${SANS_STACK}, ${BN_STACK}` }}
              >
                {ch.name}
              </div>
            ) : null}
            {doctor?.phone ? <div className="font-semibold text-stone-700">Phone: {doctor.phone}</div> : null}
            {ch.name ? (
              ch.detailLines.map((l, i) => (
                <div key={i} className="text-[10.5px] text-stone-500">
                  {l}
                </div>
              ))
            ) : (
              ch.legacyLines.map((l, i) => <div key={i}>{l}</div>)
            )}
            {!ch.name && doctor?.consultationSchedule?.trim() ? (
              <div className="mt-0.5 text-stone-500" style={bnStyle(SANS_STACK)}>
                {doctor.consultationSchedule.trim()}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2 h-[3px] w-full" style={{ backgroundColor: accent }} />
        <div className="mt-[2px] h-px w-full bg-stone-300" />

        {/* revision / version note */}
        {version > 1 && (
          <div className="mt-1 flex items-center justify-between text-[10.5px] text-stone-500 italic">
            <span>
              {t("revision")} {version}
            </span>
            {dateText ? <span>{D(dateText)}</span> : null}
          </div>
        )}
      </header>

      {/* ---------------- Patient bar ---------------- */}
      <div className="relative z-10 mt-2 grid grid-cols-[2fr_1.2fr_0.8fr_1fr] items-center gap-3 rounded border border-stone-300 bg-stone-50/70 px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[10px] tracking-wide text-stone-500 uppercase">{t("name")}</span>
          <span className="truncate text-[12.5px] font-bold text-stone-900" style={bnStyle(SANS_STACK)}>
            {bar.name || "\u00A0"}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-wide text-stone-500 uppercase">{t("age")}</span>
          <span className="font-semibold">{D(bar.age) || "—"}</span>
          <span className="text-stone-300">/</span>
          <span className="font-semibold">{bar.sex || "—"}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-wide text-stone-500 uppercase">Wt.</span>
          <span className="font-semibold">{D(bar.weight) || "—"}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] tracking-wide text-stone-500 uppercase">{t("date")}</span>
          <span className="font-semibold">{D(dateText)}</span>
        </div>
      </div>

      {/* ---------------- Body: two columns ---------------- */}
      <div className="relative z-10 mt-3 flex flex-1 gap-4">
        {/* LEFT ~38% */}
        <div className="w-[38%] shrink-0 space-y-3">
          {data.chiefComplaints.length > 0 && (
            <section>
              <BoxHeading accent={accent}>C/C — {t("chiefComplaints")}</BoxHeading>
              <ul className="mt-1.5 space-y-1" style={bnStyle(SANS_STACK)}>
                {data.chiefComplaints.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold text-stone-900">{c.label}</span>
                    {c.severity?.trim() ? <span className="text-stone-600"> ({c.severity.trim()})</span> : null}
                    {c.duration?.trim() ? <span className="text-stone-600"> — {c.duration.trim()}</span> : null}
                    {c.details?.trim() ? <div className="text-[10.5px] text-stone-500 italic">{c.details.trim()}</div> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 0 && (
            <section>
              <BoxHeading accent={accent}>H/O — {t("history")}</BoxHeading>
              <ul className="mt-1.5 space-y-1" style={bnStyle(SANS_STACK)}>
                {history.map((h) => (
                  <li key={h.short}>
                    <span className="font-semibold text-stone-800">{h.short}:</span>{" "}
                    <span className="text-stone-700">{h.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(vitals.length > 0 || data.examinations.length > 0) && (
            <section>
              <BoxHeading accent={accent}>O/E — {t("onExamination")}</BoxHeading>
              {vitals.length > 0 && (
                <div className="mt-1.5 grid grid-cols-4 gap-x-2 gap-y-1 rounded border border-stone-300 bg-stone-50/80 p-2">
                  {vitals.map((v) => (
                    <div key={v.label} className="min-w-0">
                      <div className="text-[9.5px] tracking-wide text-stone-500 uppercase">{v.label}</div>
                      <div className="truncate font-semibold text-stone-900">{D(v.value)}</div>
                    </div>
                  ))}
                </div>
              )}
              {data.examinations.length > 0 && (
                <ul className="mt-1.5 space-y-0.5" style={bnStyle(SANS_STACK)}>
                  {data.examinations.map((e) => (
                    <li key={e.id}>
                      <span className="font-semibold text-stone-800">{e.label}</span>
                      {e.value?.trim() ? <span> = {e.value.trim()}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {data.investigations.length > 0 && (
            <section>
              <BoxHeading accent={accent}>{t("investigations")}</BoxHeading>
              <ul className="mt-1.5 list-decimal space-y-0.5 pl-4" style={bnStyle(SANS_STACK)}>
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

        {/* RIGHT ~62% */}
        <div className="flex-1 space-y-3 border-l border-stone-200 pl-4">
          {diagnosis.length > 0 && (
            <section className="flex items-start gap-3">
              <span className="font-serif text-[36px] leading-[0.9] font-bold" style={{ color: accent }} aria-hidden>
                {Rx}
              </span>
              <div className="flex-1">
                <BoxHeading accent={accent}>{t("diagnosis")}</BoxHeading>
                <div className="mt-1.5" style={bnStyle(SANS_STACK)}>
                  {diagnosis.map((d, idx) => (
                    <div key={d.id} className={idx === 0 ? "text-[13px] font-bold text-stone-900" : "text-[11.5px] text-stone-800"}>
                      {idx > 0 ? `${idx + 1}. ` : ""}
                      {d.label}
                      {d.icd10?.trim() ? <span className="ml-1 text-[9.5px] font-normal text-stone-500">({d.icd10.trim()})</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {data.medicines.length > 0 && (
            <section>
              <BoxHeading accent={accent}>{t("medicines")}</BoxHeading>
              <ol className="mt-1.5 space-y-1.5">
                {data.medicines.map((m, idx) => {
                  const name = medicineName(m);
                  const detail = medicineDetail(m);
                  return (
                    <li key={m._uid} className="flex gap-2">
                      <span className="w-5 shrink-0 text-right font-semibold text-stone-500">{idx + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-stone-900" style={bnStyle(SANS_STACK)}>
                          {name}
                        </div>
                        {detail ? (
                          <div className="text-[11px] text-stone-600" style={bnStyle(SANS_STACK)}>
                            {detail}
                          </div>
                        ) : null}
                        {m.specialInstruction?.trim() ? (
                          <div className="text-[10.5px] text-stone-500 italic" style={bnStyle(SANS_STACK)}>
                            {m.specialInstruction.trim()}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {data.advice.length > 0 && (
            <section>
              <BoxHeading accent={accent}>{t("advice")}</BoxHeading>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4" style={bnStyle(SANS_STACK)}>
                {data.advice.map((a) => (
                  <li key={a.id}>{a.label}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* ---------------- Footer ---------------- */}
      <footer className="relative z-10 mt-auto pt-3">
        <div className="flex items-end justify-between gap-6">
          <div className="space-y-1 text-[11px] text-stone-700" style={bnStyle(SANS_STACK)}>
            {(data.followUp.date || data.followUp.note?.trim()) && (
              <div>
                <span className="font-bold text-stone-800">{t("nextVisit")}:</span>{" "}
                {data.followUp.date ? D(formatDate(data.followUp.date)) : ""}
                {data.followUp.note?.trim() ? (data.followUp.date ? " — " : "") + data.followUp.note.trim() : ""}
              </div>
            )}
            <div className="text-[9.5px] text-stone-400">
              {code ? `Rx No: ${code}` : "New prescription"}
              {status === "DRAFT" ? "  •  DRAFT" : ""}
            </div>
          </div>
          <div className="text-center">
            {doctor?.signatureUrl ? (
              <img src={doctor.signatureUrl} alt="" className="mx-auto mb-0.5 h-9 object-contain" />
            ) : (
              <div className="h-5" aria-hidden />
            )}
            <div className="min-w-[180px] border-t border-stone-400 pt-1 text-[12px] font-bold text-stone-900">{fullName}</div>
            {regLine ? <div className="text-[10px] text-stone-500">{regLine}</div> : null}
          </div>
        </div>
        {doctor?.footerNote?.trim() ? (
          <div className="mt-2 border-t border-stone-200 pt-1 text-center text-[10px] text-stone-500" style={bnStyle(SANS_STACK)}>
            {doctor.footerNote.trim()}
          </div>
        ) : null}
      </footer>
    </div>
  );
}

export default ClinicalTemplate;
