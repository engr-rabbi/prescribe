"use client";

// Large medicine picker dialog: auto-focused search, debounced queries against
// api.searchMedicines, keyboard navigation (↑/↓/↵/esc), result count and a
// "type at least 2 characters" hint when the query is short.

import * as React from "react";
import { Loader2Icon, PillIcon, SearchIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type { MedicineRecord } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { abbreviateForm } from "@/lib/rx-utils";

const L = {
  title: { en: "Search Medicine", bn: "ঔষধ খুঁজুন" },
  typeHint: { en: "Type at least 2 characters — brand / generic / company…", bn: "কমপক্ষে ২ অক্ষর লিখুন — ব্র্যান্ড / জেনেরিক / কোম্পানি…" },
  searchPlaceholder: { en: "e.g. NAPA, seclo, omeprazole…", bn: "যেমন নাপা, সেকলো, omeprazole…" },
};

export interface MedicineSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (medicine: MedicineRecord) => void;
}

export function MedicineSearchDialog({ open, onOpenChange, onSelect }: MedicineSearchDialogProps) {
  const { lang, t } = useI18n();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<MedicineRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const reqRef = React.useRef(0);

  const trimmed = q.trim();
  const belowMin = trimmed.length < 2;

  // reset each time the dialog opens + focus the search input
  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setResults([]);
    setTotal(0);
    setHighlighted(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // debounced search (250ms) with stale-response protection
  React.useEffect(() => {
    if (!open || belowMin) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const id = ++reqRef.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .searchMedicines(trimmed, { limit: 40 })
        .then((res) => {
          if (reqRef.current !== id) return;
          setResults(res.items);
          setTotal(res.total);
        })
        .catch(() => {
          if (reqRef.current === id) {
            setResults([]);
            setTotal(0);
          }
        })
        .finally(() => {
          if (reqRef.current === id) setLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, trimmed, belowMin]);

  React.useEffect(() => {
    setHighlighted(0);
  }, [trimmed]);

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, results.length]);

  const pick = (m: MedicineRecord) => {
    onOpenChange(false);
    onSelect(m);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = results[highlighted] ?? results[0];
      if (row) pick(row);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl" showCloseButton>
        <DialogHeader className="border-b px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <PillIcon className="size-4 text-teal-600" />
            {L.title[lang]}
          </DialogTitle>
          <DialogDescription className="text-xs">{t("addMedicine")}</DialogDescription>
        </DialogHeader>

        {/* big search input */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={L.searchPlaceholder[lang]}
            className="h-8 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {loading ? <Loader2Icon className="size-4 shrink-0 animate-spin text-teal-600" /> : null}
        </div>

        {/* results */}
        <div ref={listRef} className="max-h-[50vh] min-h-28 overflow-y-auto overscroll-contain p-2">
          {belowMin ? (
            <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {L.typeHint[lang]}
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-24 items-center justify-center px-4 text-center text-xs text-muted-foreground">
              {loading ? t("loading") : t("noResults")}
            </div>
          ) : (
            results.map((m, i) => (
              <button
                type="button"
                key={m.id}
                data-idx={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseMove={() => setHighlighted(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                  highlighted === i && "bg-accent text-accent-foreground"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{m.brandName}</span>
                    {m.strength ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{m.strength}</span>
                    ) : null}
                    <Badge
                      variant="outline"
                      className="shrink-0 border-teal-600/40 px-1 text-[10px] font-normal text-teal-700 dark:text-teal-400"
                    >
                      {abbreviateForm(m.dosageForm)}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.generic}
                    {m.manufacturer ? <span className="text-[11px]"> • {m.manufacturer}</span> : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* footer: result count + keyboard hints */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
          <span>{!belowMin && total > 0 ? `${total} ${t("totalRecords")}` : ""}</span>
          <span>↑ ↓ • ↵ • esc</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MedicineSearchDialog;
