"use client";

// Per-medicine dosage editor card. Every field is click-to-select via
// SearchCombobox over the shared option constants (with free-typed custom
// values allowed), plus a "write custom line" toggle that swaps the structured
// grid for one free-text textarea (useful for Bengali handwritten-style lines).

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  FileTextIcon,
  ListPlusIcon,
  XIcon,
} from "lucide-react";
import type { MedicineLine } from "@/lib/types";
import {
  DOSE_OPTIONS,
  DURATION_OPTIONS,
  FREQUENCY_OPTIONS,
  MEAL_TIMING_OPTIONS,
  ROUTE_OPTIONS,
} from "@/lib/constants";
import { useI18n } from "@/lib/i18n";
import { abbreviateForm, formatMedicineLine } from "@/lib/rx-utils";
import { usePrescriptionStore } from "@/store/prescription-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SearchCombobox, type ComboboxOption } from "@/components/combobox/search-combobox";

const L = {
  unnamed: { en: "Unnamed medicine", bn: "নামহীন ঔষধ" },
  customLine: { en: "Or write custom line", bn: "অথবা নিজের লাইন লিখুন" },
  structured: { en: "Use structured fields", bn: "স্ট্রাকচার্ড ফিল্ড ব্যবহার করুন" },
  configure: { en: "Click to configure dose & frequency", bn: "মাত্রা ও সেবনবিধি দিতে ক্লিক করুন" },
  continueAfterRelief: { en: "Continue even after relief", bn: "ব্যথা কমলেও চালিয়ে যাবেন" },
  completeCourse: { en: "Complete full course", bn: "পূর্ণ কোর্স শেষ করবেন" },
  plentyWater: { en: "With plenty of water", bn: "প্রচুর পানি দিয়ে" },
  chewTablet: { en: "Chew before swallowing", bn: "চিবিয়ে খাবেন" },
};

const INSTRUCTION_CHIPS: [string, string][] = [
  [L.continueAfterRelief.en, L.continueAfterRelief.bn],
  [L.completeCourse.en, L.completeCourse.bn],
  [L.plentyWater.en, L.plentyWater.bn],
  [L.chewTablet.en, L.chewTablet.bn],
];

// ---- local option loaders (filter constant lists in memory) ----------------

function filterText(list: string[], q: string): ComboboxOption[] {
  const n = q.toLowerCase();
  return list.filter((o) => o.toLowerCase().includes(n)).map((o) => ({ value: o, label: o }));
}

function filterPairs(
  list: { value: string; label: string; labelBn?: string }[],
  q: string
): ComboboxOption[] {
  const n = q.toLowerCase();
  return list
    .filter(
      (o) =>
        o.label.toLowerCase().includes(n) ||
        o.value.toLowerCase().includes(n) ||
        (o.labelBn ?? "").includes(q)
    )
    .map((o) => ({ value: o.value, label: o.label, labelBn: o.labelBn }));
}

export interface MedicineLineEditorProps {
  line: MedicineLine;
  index: number;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function MedicineLineEditor({ line, index, total, collapsed, onToggle, disabled }: MedicineLineEditorProps) {
  const { lang, t } = useI18n();
  const updateMedicine = usePrescriptionStore((s) => s.updateMedicine);
  const removeMedicine = usePrescriptionStore((s) => s.removeMedicine);
  const moveMedicine = usePrescriptionStore((s) => s.moveMedicine);

  const [customMode, setCustomMode] = React.useState(line.customText.trim().length > 0);

  const loadDose = React.useCallback((q: string) => Promise.resolve(filterText(DOSE_OPTIONS, q)), []);
  const loadFrequency = React.useCallback((q: string) => Promise.resolve(filterPairs(FREQUENCY_OPTIONS, q)), []);
  const loadRoute = React.useCallback((q: string) => Promise.resolve(filterPairs(ROUTE_OPTIONS, q)), []);
  const loadMeal = React.useCallback((q: string) => Promise.resolve(filterPairs(MEAL_TIMING_OPTIONS, q)), []);
  const loadDuration = React.useCallback((q: string) => Promise.resolve(filterPairs(DURATION_OPTIONS, q)), []);

  const patch = (p: Partial<MedicineLine>) => updateMedicine(line._uid, p);
  const formAbbr = abbreviateForm(line.dosageForm);
  const summary = formatMedicineLine(line);

  return (
    <div className="rounded-lg border bg-card shadow-xs">
      {/* header */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
        >
          <Badge className="shrink-0 bg-teal-600 text-[10px] text-white hover:bg-teal-600">{index + 1}</Badge>
          <span className="truncate text-sm font-semibold">{line.brandName || L.unnamed[lang]}</span>
          {line.strength ? (
            <span className="shrink-0 text-xs text-muted-foreground">{line.strength}</span>
          ) : null}
          {formAbbr ? (
            <Badge
              variant="outline"
              className="shrink-0 border-teal-600/40 px-1 text-[10px] font-normal text-teal-700 dark:text-teal-400"
            >
              {formAbbr}
            </Badge>
          ) : null}
          <ChevronDownIcon
            className={cn("ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-180")}
          />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => moveMedicine(line._uid, -1)}
          disabled={disabled || index === 0}
          title={lang === "bn" ? "উপরে" : "Move up"}
        >
          <ArrowUpIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => moveMedicine(line._uid, 1)}
          disabled={disabled || index === total - 1}
          title={lang === "bn" ? "নিচে" : "Move down"}
        >
          <ArrowDownIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 text-destructive hover:text-destructive"
          onClick={() => removeMedicine(line._uid)}
          disabled={disabled}
          title={t("delete")}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {collapsed ? (
        <div className="truncate border-t px-2 py-1.5 text-xs text-muted-foreground">
          {summary || L.configure[lang]}
        </div>
      ) : (
        <div className="space-y-2 border-t px-2 pt-2 pb-2">
          {customMode ? (
            <Textarea
              value={line.customText}
              onChange={(e) => patch({ customText: e.target.value })}
              rows={2}
              disabled={disabled}
              placeholder={
                lang === "bn"
                  ? "যেমন: খাবারের পরে ১টি করে সকালে ও রাতে — ৫ দিন"
                  : "e.g. 1 tab after meal morning & night — 5 days"
              }
              className="min-h-0 text-sm"
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 md:grid-cols-3">
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("dose")}</div>
                <SearchCombobox
                  size="sm"
                  value={line.dose}
                  placeholder={t("dose")}
                  loadOptions={loadDose}
                  allowCustom
                  onSelect={(o) => patch({ dose: o.label })}
                  disabled={disabled}
                  debounceMs={80}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("frequency")}</div>
                <SearchCombobox
                  size="sm"
                  value={line.frequency}
                  placeholder={t("frequency")}
                  loadOptions={loadFrequency}
                  allowCustom
                  onSelect={(o) => patch({ frequency: o.value })}
                  disabled={disabled}
                  debounceMs={80}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("route")}</div>
                <SearchCombobox
                  size="sm"
                  value={line.route}
                  placeholder={t("route")}
                  loadOptions={loadRoute}
                  allowCustom
                  onSelect={(o) => patch({ route: o.value })}
                  disabled={disabled}
                  debounceMs={80}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("mealTiming")}</div>
                <SearchCombobox
                  size="sm"
                  value={line.mealTiming}
                  placeholder={t("mealTiming")}
                  loadOptions={loadMeal}
                  allowCustom
                  onSelect={(o) => patch({ mealTiming: o.value })}
                  disabled={disabled}
                  debounceMs={80}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("duration")}</div>
                <SearchCombobox
                  size="sm"
                  value={line.duration}
                  placeholder={t("duration")}
                  loadOptions={loadDuration}
                  allowCustom
                  onSelect={(o) => patch({ duration: o.value })}
                  disabled={disabled}
                  debounceMs={80}
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">{t("instruction")}</div>
                <Input
                  value={line.specialInstruction}
                  onChange={(e) => patch({ specialInstruction: e.target.value })}
                  disabled={disabled}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* special-instruction quick chips */}
          {!customMode ? (
            <div className="flex flex-wrap gap-1">
              {INSTRUCTION_CHIPS.map(([en, bn]) => (
                <button
                  type="button"
                  key={en}
                  disabled={disabled}
                  onClick={() =>
                    patch({
                      specialInstruction: line.specialInstruction
                        ? `${line.specialInstruction}, ${lang === "bn" ? bn : en}`
                        : (lang === "bn" ? bn : en),
                    })
                  }
                  className="rounded-full border border-teal-600/30 px-1.5 py-0.5 text-[10px] text-teal-700 transition-colors hover:bg-teal-50 disabled:opacity-50 dark:border-teal-500/40 dark:text-teal-400 dark:hover:bg-teal-950/40"
                >
                  {lang === "bn" ? bn : en}
                </button>
              ))}
            </div>
          ) : null}

          {/* custom-line toggle */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (customMode) {
                setCustomMode(false);
                patch({ customText: "" });
              } else {
                setCustomMode(true);
              }
            }}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline disabled:opacity-50 dark:text-teal-400"
          >
            {customMode ? <ListPlusIcon className="size-3" /> : <FileTextIcon className="size-3" />}
            {customMode ? L.structured[lang] : L.customLine[lang]}
          </button>
        </div>
      )}
    </div>
  );
}

export default MedicineLineEditor;
