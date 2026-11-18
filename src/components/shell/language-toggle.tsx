"use client";

import React from "react";
import { useI18n, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "bn", label: "বাংলা" },
];

/** Compact segmented "EN | বাংলা" language switcher for the top bar. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center rounded-full border border-slate-200 bg-slate-100 p-0.5",
        className
      )}
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              active
                ? "bg-teal-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageToggle;
