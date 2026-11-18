"use client";

// Universal multi-select clinical picker (Chief Complaints / History /
// Diagnosis / Investigations / Advice / Exam findings).
//
// Click the trigger → dialog opens with the full list. It provides:
//   • instant search (English / Bengali / ICD-10 code)
//   • category filter chips (specialty / test group / history field)
//   • multi-select with checkboxes and a selected-items management area
//   • custom entry — typed text is persisted (isCustom) so it is reusable,
//     and is added immediately so the doctor is never blocked
//   • responsive: bottom-sheet-like dialog on mobile, centered on desktop

import * as React from "react";
import { CheckIcon, Loader2Icon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type { LibraryItemDTO } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type PickerCategory =
  | "COMPLAINT"
  | "DIAGNOSIS"
  | "INVESTIGATION"
  | "ADVICE"
  | "HISTORY"
  | "EXAM";

export interface LibraryPickerDialogProps {
  category: PickerCategory;
  title: string;
  /** fixed subcategory (e.g. history field key) — hides the filter chips */
  fixedSubcategory?: string;
  onAdd: (items: LibraryItemDTO[]) => void;
  variant?: "input" | "button";
  buttonLabel?: string;
  triggerLabel?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  /** badge key shown on rows: none | code (ICD-10) | subcategory */
  badge?: "none" | "code" | "subcategory";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: PickerCategory;
  title: string;
  fixedSubcategory?: string;
  onAdd: (items: LibraryItemDTO[]) => void;
  badge?: "none" | "code" | "subcategory";
}

const debounce = 250;

export function LibraryPickerDialog({ open, onOpenChange, category, title, fixedSubcategory, onAdd, badge = "none" }: Props) {
  const { lang, t } = useI18n();
  const [query, setQuery] = React.useState("");
  const [activeCat, setActiveCat] = React.useState<string>("ALL");
  const [subcats, setSubcats] = React.useState<string[]>([]);
  const [items, setItems] = React.useState<LibraryItemDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<LibraryItemDTO[]>([]);
  const [customText, setCustomText] = React.useState("");
  const [customBusy, setCustomBusy] = React.useState(false);

  const reqRef = React.useRef(0);

  // reset per open
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveCat("ALL");
      setSelected([]);
      setCustomText("");
    }
  }, [open]);

  // load list + facet groups
  React.useEffect(() => {
    if (!open) return;
    const id = ++reqRef.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .listLibrary(category, query.trim(), fixedSubcategory ?? (activeCat === "ALL" ? "" : activeCat))
        .then((res) => {
          if (reqRef.current !== id) return;
          setItems(res.items);
          if (!fixedSubcategory) setSubcats(res.subcategories.filter(Boolean));
        })
        .catch(() => {
          if (reqRef.current === id) setItems([]);
        })
        .finally(() => {
          if (reqRef.current === id) setLoading(false);
        });
    }, debounce);
    return () => window.clearTimeout(timer);
  }, [open, query, activeCat, category, fixedSubcategory]);

  const exactMatch = items.some(
    (i) => i.labelEn.toLowerCase() === customText.trim().toLowerCase()
  );
  const canAddCustom = customText.trim().length > 0 && !exactMatch;

  const toggle = (item: LibraryItemDTO) => {
    setSelected((prev) =>
      prev.some((x) => x.id === item.id) ? prev.filter((x) => x.id !== item.id) : [...prev, item]
    );
  };

  const removeSelected = (id: string) =>
    setSelected((prev) => prev.filter((x) => x.id !== id));

  const commit = () => {
    if (selected.length === 0) return;
    onAdd(selected);
    onOpenChange(false);
  };

  const addCustom = () => {
    const text = customText.trim();
    if (!text) return;
    setCustomBusy(true);
    api
      .addLibraryItem({ category, labelEn: text, subcategory: fixedSubcategory ?? (activeCat === "ALL" ? "" : activeCat) })
      .then((res) => {
        setSelected((prev) => (prev.some((x) => x.id === res.item.id) ? prev : [...prev, res.item]));
        setItems((prev) => (prev.some((x) => x.id === res.item.id) ? prev : [res.item, ...prev]));
        setCustomText("");
        toast.success(t("customSavedNote"));
      })
      .catch(() => {
        // Offline fallback — still add locally so the doctor is never blocked
        const pseudo: LibraryItemDTO = {
          id: `local-${Date.now().toString(36)}`,
          category,
          subcategory: "",
          labelEn: text,
          labelBn: "",
          code: "",
          isCustom: true,
          usageCount: 0,
        };
        setSelected((prev) => [...prev, pseudo]);
        setCustomText("");
      })
      .finally(() => setCustomBusy(false));
  };

  const label = (item: LibraryItemDTO) => (lang === "bn" && item.labelBn ? item.labelBn : item.labelEn);
  const subLabel = (item: LibraryItemDTO) => (lang === "bn" ? item.labelEn : item.labelBn);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>

        {/* search + category filters */}
        <div className="space-y-2 border-b px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading ? <Loader2Icon className="size-4 shrink-0 animate-spin text-teal-600" /> : null}
          </div>
          {!fixedSubcategory && subcats.length > 1 ? (
            <div className="flex max-h-[68px] flex-wrap gap-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => setActiveCat("ALL")}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  activeCat === "ALL"
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-teal-600/30 text-teal-700 hover:bg-teal-50 dark:border-teal-500/40 dark:text-teal-400 dark:hover:bg-teal-950/40"
                )}
              >
                {t("allCategories")}
              </button>
              {subcats.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setActiveCat(sc)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    activeCat === sc
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-teal-600/30 text-teal-700 hover:bg-teal-50 dark:border-teal-500/40 dark:text-teal-400 dark:hover:bg-teal-950/40"
                  )}
                >
                  {sc}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* result list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="listbox" aria-multiselectable>
          {items.length === 0 && !loading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">{t("noResults")}</div>
          ) : (
            items.map((item) => {
              const isSel = selected.some((x) => x.id === item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => toggle(item)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent",
                    isSel && "bg-teal-50 dark:bg-teal-950/30"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isSel ? "border-teal-600 bg-teal-600 text-white" : "border-input"
                    )}
                  >
                    {isSel ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", isSel && "font-medium")}>{label(item)}</span>
                    {subLabel(item) ? (
                      <span className="block truncate text-xs text-muted-foreground">{subLabel(item)}</span>
                    ) : null}
                  </span>
                  {badge === "code" && item.code ? (
                    <Badge variant="outline" className="mt-0.5 shrink-0 border-teal-600/40 font-mono text-[10px] text-teal-700 dark:text-teal-400">
                      {item.code}
                    </Badge>
                  ) : null}
                  {badge === "subcategory" && item.subcategory ? (
                    <Badge variant="secondary" className="mt-0.5 max-w-32 shrink-0 truncate text-[10px] font-normal">
                      {item.subcategory}
                    </Badge>
                  ) : null}
                  {item.isCustom ? (
                    <Badge variant="secondary" className="mt-0.5 shrink-0 text-[9px] font-normal uppercase">
                      custom
                    </Badge>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* custom entry + selected management */}
        <div className="space-y-2 border-t px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canAddCustom) addCustom();
                }
              }}
              placeholder={t("typeCustomEntry")}
              className="h-9 text-sm"
              disabled={customBusy}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 shrink-0 border-teal-600/50 text-teal-700 hover:bg-teal-50 dark:border-teal-500/50 dark:text-teal-400 dark:hover:bg-teal-950/40"
              onClick={addCustom}
              disabled={!canAddCustom || customBusy}
            >
              {customBusy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              <span className="hidden sm:inline">{t("addCustomEntry")}</span>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("customSavedNote")}</p>

          {selected.length > 0 ? (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                {t("selected")} ({selected.length})
              </span>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {selected.map((s) => (
                  <span
                    key={s.id}
                    className="flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs"
                  >
                    <span className="max-w-56 truncate">{label(s)}</span>
                    <button
                      type="button"
                      onClick={() => removeSelected(s.id)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                      title={t("delete")}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-teal-600 text-white hover:bg-teal-700"
            onClick={commit}
            disabled={selected.length === 0}
          >
            <CheckIcon className="size-4" />
            {t("addSelected")} ({selected.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Click-to-select trigger + dialog in one wrapper component. */
export function LibraryPicker({
  category,
  title,
  fixedSubcategory,
  onAdd,
  variant = "input",
  buttonLabel,
  triggerLabel,
  disabled,
  size = "default",
  className,
  badge = "none",
}: LibraryPickerDialogProps) {
  const [open, setOpen] = React.useState(false);
  const { t } = useI18n();

  const trigger =
    variant === "button" ? (
      <Button
        type="button"
        variant="outline"
        size={size === "sm" ? "sm" : "default"}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "border-dashed border-teal-600/50 text-teal-700 hover:bg-teal-50 dark:border-teal-500/50 dark:text-teal-400 dark:hover:bg-teal-950/40",
          className
        )}
      >
        <PlusIcon className="size-4" />
        {buttonLabel ?? t("addItem")}
      </Button>
    ) : (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "hover:border-teal-600/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8" : "h-9",
          className
        )}
      >
        <span className="truncate text-muted-foreground">{triggerLabel ?? t("addItem")}</span>
        <PlusIcon className="size-4 shrink-0 opacity-50" />
      </button>
    );

  return (
    <div className={cn("min-w-0", className)}>
      {trigger}
      <LibraryPickerDialog
        open={open}
        onOpenChange={setOpen}
        category={category}
        title={title}
        fixedSubcategory={fixedSubcategory}
        onAdd={onAdd}
        badge={badge}
      />
    </div>
  );
}

export default LibraryPicker;
