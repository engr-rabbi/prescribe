"use client";

// Library-backed combobox: searches the server clinical library
// (complaints / diagnoses / investigations / advice / history / exam findings).
// Custom entries are persisted via api.addLibraryItem; if the API is offline
// we still call onSelect with a local pseudo-item so the UX never blocks.

import * as React from "react";
import { api } from "@/lib/api-client";
import type { LibraryItemDTO } from "@/lib/types";
import { SearchCombobox, type ComboboxOption, type SearchComboboxProps } from "./search-combobox";

export type LibraryCategory =
  | "COMPLAINT"
  | "DIAGNOSIS"
  | "INVESTIGATION"
  | "ADVICE"
  | "HISTORY"
  | "EXAM";

export interface LibraryComboboxProps {
  category: LibraryCategory;
  placeholder: string;
  onSelect: (item: LibraryItemDTO) => void;
  allowCustom?: boolean;
  /** "input" = select-style trigger, "button" = compact "+" quick-add button */
  variant?: "input" | "button";
  buttonLabel?: string;
  buttonIcon?: React.ReactNode;
  disabled?: boolean;
  size?: SearchComboboxProps["size"];
  className?: string;
  triggerClassName?: string;
  emptyText?: string;
}

function toOption(it: LibraryItemDTO): ComboboxOption<LibraryItemDTO> {
  return {
    value: it.id,
    label: it.labelEn,
    labelBn: it.labelBn || undefined,
    badge: it.code || undefined,
    item: it,
  };
}

export function LibraryCombobox({
  category,
  placeholder,
  onSelect,
  allowCustom = true,
  variant = "input",
  buttonLabel,
  buttonIcon,
  disabled,
  size,
  className,
  triggerClassName,
  emptyText,
}: LibraryComboboxProps) {
  const loadOptions = React.useCallback(
    async (q: string): Promise<ComboboxOption<LibraryItemDTO>[]> => {
      const res = await api.listLibrary(category, q);
      return res.items.map(toOption);
    },
    [category]
  );

  // Persist a custom entry; on failure (offline) fall back to a local
  // pseudo-item so the doctor can keep working.
  const handleCustom = React.useCallback(
    (q: string) => {
      api
        .addLibraryItem({ category, labelEn: q })
        .then((res) => onSelect(res.item))
        .catch(() => {
          onSelect({
            id: `local-${Date.now().toString(36)}`,
            category,
            subcategory: "",
            labelEn: q,
            labelBn: "",
            code: "",
            isCustom: true,
            usageCount: 0,
          });
        });
    },
    [category, onSelect]
  );

  return (
    <div className={className}>
      <SearchCombobox<LibraryItemDTO>
        placeholder={placeholder}
        loadOptions={loadOptions}
        onSelect={(o) => {
          if (o.isCustom) handleCustom(o.label);
          else if (o.item) onSelect(o.item);
        }}
        onCustomSelect={allowCustom ? handleCustom : undefined}
        allowCustom={allowCustom}
        disabled={disabled}
        variant={variant}
        buttonLabel={buttonLabel}
        icon={variant === "input" ? buttonIcon : undefined}
        size={size}
        triggerClassName={triggerClassName}
        emptyText={emptyText}
      />
    </div>
  );
}

export default LibraryCombobox;
