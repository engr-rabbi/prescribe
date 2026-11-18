"use client";

// Generic click-to-select combobox.
// Click/focus opens a popover with a search input on top and an async,
// debounced result list below. Keyboard: ↑/↓ navigate, ↵ select, esc close.
// If `allowCustom` is set and the query has no exact match, the first row is
// `+ Add "<query>"` so the UX never blocks the doctor.

import * as React from "react";
import { ChevronDownIcon, Loader2Icon, PlusIcon, SearchIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export interface ComboboxOption<T = unknown> {
  value: string;
  label: string;
  labelBn?: string;
  /** small secondary line (e.g. patient code / generic name) */
  secondary?: string;
  /** tiny badge rendered on the right (e.g. ICD-10 code) */
  badge?: string;
  /** row produced from free-typed query (no library match) */
  isCustom?: boolean;
  /** original payload (LibraryItemDTO / PatientDTO / MedicineRecord …) */
  item?: T;
}

export interface SearchComboboxProps<T = unknown> {
  placeholder?: string;
  /** currently selected value shown on the trigger */
  value?: string;
  onSelect: (option: ComboboxOption<T>) => void;
  /** async option loader; memoize with useCallback/useMemo in the caller */
  loadOptions: (query: string) => Promise<ComboboxOption<T>[]>;
  /** show `+ Add "<query>"` row when query has no exact match */
  allowCustom?: boolean;
  /** when provided, custom rows are routed here instead of onSelect */
  onCustomSelect?: (query: string) => void;
  renderOption?: (option: ComboboxOption<T>) => React.ReactNode;
  /** fixed row height in px (helps dense clinical lists) */
  optionHeight?: number;
  emptyText?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** "input" = full-width select-style trigger, "button" = compact + button */
  variant?: "input" | "button";
  buttonLabel?: string;
  size?: "sm" | "default";
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  /** minimum characters before the loader fires (e.g. 2 for medicines) */
  minQueryLength?: number;
  /** hint shown below minQueryLength (e.g. "Type at least 2 characters") */
  queryHint?: string;
  searchPlaceholder?: string;
  debounceMs?: number;
  align?: "start" | "center" | "end";
}

const L = {
  navigate: { en: "navigate", bn: "নেভিগেট" },
  select: { en: "select", bn: "নির্বাচন" },
  close: { en: "close", bn: "বন্ধ" },
  add: { en: "Add", bn: "যোগ করুন" },
};

export function SearchCombobox<T = unknown>(props: SearchComboboxProps<T>) {
  const {
    placeholder,
    value,
    onSelect,
    loadOptions,
    allowCustom = false,
    onCustomSelect,
    renderOption,
    optionHeight,
    emptyText,
    icon,
    disabled = false,
    variant = "input",
    buttonLabel,
    size = "default",
    className,
    triggerClassName,
    popoverClassName,
    minQueryLength = 0,
    queryHint,
    searchPlaceholder,
    debounceMs = 250,
    align = "start",
  } = props;

  const { lang, t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<ComboboxOption<T>[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);

  const reqRef = React.useRef(0);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const trimmed = query.trim();
  const belowMin = trimmed.length < minQueryLength;

  // Debounced async loading with stale-response protection.
  React.useEffect(() => {
    if (!open) return;
    if (belowMin) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const id = ++reqRef.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      loadOptions(trimmed)
        .then((res) => {
          if (reqRef.current === id) setOptions(res);
        })
        .catch(() => {
          if (reqRef.current === id) setOptions([]);
        })
        .finally(() => {
          if (reqRef.current === id) setLoading(false);
        });
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [open, trimmed, belowMin, debounceMs, loadOptions]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setQuery("");
    setHighlighted(0);
    if (!next) {
      setOptions([]);
      setLoading(false);
      reqRef.current++; // invalidate in-flight requests
    }
  };

  // Custom row: allowCustom + non-empty query + no exact (case-insensitive) match.
  const exactMatch = options.some(
    (o) => !o.isCustom && o.label.toLowerCase() === trimmed.toLowerCase()
  );
  const customOption: ComboboxOption<T> | null =
    allowCustom && trimmed.length > 0 && !exactMatch
      ? { value: "__custom__", label: trimmed, isCustom: true }
      : null;
  const rows: ComboboxOption<T>[] = customOption ? [customOption, ...options] : options;

  React.useEffect(() => {
    setHighlighted(0);
  }, [query]);

  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, rows.length, open]);

  const commit = React.useCallback(
    (option: ComboboxOption<T>) => {
      setOpen(false);
      setQuery("");
      if (option.isCustom) {
        if (onCustomSelect) onCustomSelect(option.label);
        else onSelect({ ...option, value: option.label });
      } else {
        onSelect(option);
      }
    },
    [onSelect, onCustomSelect]
  );

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[highlighted];
      if (row) commit(row);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const renderDefault = (o: ComboboxOption<T>) => {
    const isBn = lang === "bn" && !!o.labelBn;
    const primary = isBn ? o.labelBn : o.label;
    const secondary = isBn ? o.label : o.secondary;
    return (
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm leading-tight font-medium">{primary}</span>
        {secondary ? (
          <span className="truncate text-xs leading-tight text-muted-foreground">{secondary}</span>
        ) : null}
      </div>
    );
  };

  const trigger =
    variant === "button" ? (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md border border-dashed px-1.5 text-xs font-medium text-teal-700 transition-colors",
          "hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-500/40 dark:text-teal-400 dark:hover:bg-teal-950/30",
          triggerClassName
        )}
      >
        {icon ?? <PlusIcon className="size-3.5" />}
        {buttonLabel ? <span>{buttonLabel}</span> : null}
      </button>
    ) : (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "hover:border-teal-600/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8" : "h-9",
          !value && "text-muted-foreground",
          triggerClassName
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span className="truncate">{value || placeholder || t("clickToSelect")}</span>
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-40" />
      </button>
    );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        role="listbox"
        align={align}
        sideOffset={4}
        collisionPadding={8}
        className={cn("min-w-64 p-0", popoverClassName)}
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      >
        {/* search input at top */}
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={searchPlaceholder ?? placeholder ?? t("search")}
            className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? <Loader2Icon className="size-3.5 shrink-0 animate-spin text-teal-600" /> : null}
        </div>

        {/* results */}
        <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {belowMin ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {queryHint ?? t("search")}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {loading ? t("loading") : (emptyText ?? t("noResults"))}
            </div>
          ) : (
            rows.map((o, i) => (
              <div
                key={o.isCustom ? "__custom__" : `${o.value}-${i}`}
                data-idx={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                onMouseMove={() => setHighlighted(i)}
                style={optionHeight ? { height: optionHeight } : undefined}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  highlighted === i && "bg-accent text-accent-foreground",
                  o.isCustom && "font-medium text-teal-700 dark:text-teal-400"
                )}
              >
                {o.isCustom ? (
                  <>
                    <PlusIcon className="size-4 shrink-0" />
                    <span className="truncate">
                      {lang === "bn" ? `"${o.label}" ${L.add.bn}` : `${L.add.en} "${o.label}"`}
                    </span>
                  </>
                ) : (
                  <>
                    {renderOption ? renderOption(o) : renderDefault(o)}
                    {o.badge ? (
                      <Badge
                        variant="outline"
                        className="ml-auto shrink-0 border-teal-600/40 px-1 text-[10px] font-normal text-teal-700 dark:text-teal-400"
                      >
                        {o.badge}
                      </Badge>
                    ) : null}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* keyboard hint footer */}
        <div className="flex items-center justify-between border-t px-2.5 py-1 text-[10px] text-muted-foreground">
          <span>↑ ↓ {L.navigate[lang]}</span>
          <span>
            ↵ {L.select[lang]} · esc {L.close[lang]}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SearchCombobox;
