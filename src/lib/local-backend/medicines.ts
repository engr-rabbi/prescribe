// Medicine master catalogue (read-only). Loaded lazily from the bundled CSV the
// first time it's needed, then searched in memory — same ranking rules as the
// original SQL: brand-name prefix matches first, then brand / generic /
// manufacturer / strength "contains" matches, alphabetical by brand.

import type { MedicineRecord } from "@/lib/types";
import { dataSource } from "./data-source";

export interface ImportReport {
  imported: number;
  skipped: number;
  errors: string[];
}

interface Catalogue {
  items: MedicineRecord[]; // sorted by brandName (binary order)
  lower: { brand: string; generic: string; manufacturer: string; strength: string }[];
  forms: string[];
  stats: { total: number; allopathic: number; herbal: number; forms: number; manufacturers: number };
  report: ImportReport;
}

let catalogue: Promise<Catalogue> | null = null;

// RFC-4180 CSV parser (quotes, commas, newlines)
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function parseCatalogueCSV(text: string): { items: MedicineRecord[]; report: ImportReport } {
  const report: ImportReport = { imported: 0, skipped: 0, errors: [] };
  const rows = parseCSV(text.replace(/^\uFEFF/, ""));
  const [header, ...data] = rows;
  const col = (name: string) => (header ?? []).findIndex((h) => h.trim().toLowerCase() === name);
  const iId = col("brand id");
  const iBrand = col("brand name");
  const iType = col("type");
  const iSlug = col("slug");
  const iForm = col("dosage form");
  const iGeneric = col("generic");
  const iStrength = col("strength");
  const iMan = col("manufacturer");
  const iContainer = col("package container");
  const iSize = col("package size");

  const items: MedicineRecord[] = [];
  if (iId < 0 || iBrand < 0) {
    report.errors.push("CSV header mismatch — 'brand id' / 'brand name' columns missing");
  } else {
    const seen = new Set<number>();
    data.forEach((row, r) => {
      const idRaw = (row[iId] || "").trim();
      const brandName = (row[iBrand] || "").trim();
      if (!idRaw || !brandName) {
        report.skipped++;
        return;
      }
      const id = Number(idRaw);
      if (!Number.isFinite(id)) {
        report.errors.push(`Line ${r + 2}: invalid brand id "${idRaw}"`);
        report.skipped++;
        return;
      }
      if (seen.has(id)) {
        report.errors.push(`Line ${r + 2}: duplicate brand id ${id} (${brandName}) — skipped`);
        report.skipped++;
        return;
      }
      seen.add(id);
      items.push({
        id,
        brandName,
        type: (row[iType] || "allopathic").trim(),
        slug: (row[iSlug] || "").trim(),
        dosageForm: (row[iForm] || "").trim(),
        generic: (row[iGeneric] || "").trim(),
        strength: (row[iStrength] || "").trim(),
        manufacturer: (row[iMan] || "").trim(),
        packageContainer: (row[iContainer] || "").trim(),
        packageSize: (row[iSize] || "").trim(),
      });
      report.imported++;
    });
  }

  return { items, report };
}

/** Validate raw catalogue records (e.g. rows read from the Medicines sheet). */
export function validateCatalogue(raw: MedicineRecord[]): { items: MedicineRecord[]; report: ImportReport } {
  const report: ImportReport = { imported: 0, skipped: 0, errors: [] };
  const seen = new Set<number>();
  const items: MedicineRecord[] = [];
  raw.forEach((m, i) => {
    if (!Number.isFinite(m.id) || !m.brandName) {
      report.skipped++;
      return;
    }
    if (seen.has(m.id)) {
      report.errors.push(`Row ${i + 2}: duplicate brand id ${m.id} (${m.brandName}) — skipped`);
      report.skipped++;
      return;
    }
    seen.add(m.id);
    items.push(m);
    report.imported++;
  });
  return { items, report };
}

function indexCatalogue(parsed: { items: MedicineRecord[]; report: ImportReport }): Catalogue {
  const { items, report } = parsed;
  items.sort((a, b) => (a.brandName < b.brandName ? -1 : a.brandName > b.brandName ? 1 : a.id - b.id));
  const lower = items.map((m) => ({
    brand: m.brandName.toLowerCase(),
    generic: m.generic.toLowerCase(),
    manufacturer: m.manufacturer.toLowerCase(),
    strength: m.strength.toLowerCase(),
  }));
  const formSet = new Set(items.map((m) => m.dosageForm));
  const manSet = new Set(items.map((m) => m.manufacturer));
  return {
    items,
    lower,
    forms: [...formSet].filter((f) => f !== "").sort(),
    stats: {
      total: items.length,
      allopathic: items.filter((m) => m.type === "allopathic").length,
      herbal: items.filter((m) => m.type === "herbal").length,
      forms: formSet.size,
      manufacturers: manSet.size,
    },
    report,
  };
}

/**
 * Where the catalogue comes from. Default: the bundled CSV. Remote (Google) build:
 * the Medicines sheet via the backend, cached in IndexedDB. Apps Script: the sheet itself.
 */
export interface CatalogueProvider {
  /** `force` = bypass any cache and re-read the source (admin "Re-import") */
  load(force?: boolean): Promise<{ items: MedicineRecord[]; report: ImportReport }> | { items: MedicineRecord[]; report: ImportReport };
}

const csvProvider: CatalogueProvider = {
  load: async () => parseCatalogueCSV(await dataSource().text("medicines.csv")),
};
let provider: CatalogueProvider = csvProvider;

export function setCatalogueProvider(p: CatalogueProvider | null) {
  provider = p ?? csvProvider;
  catalogue = null;
}

export function loadCatalogue(force = false): Promise<Catalogue> {
  if (!catalogue) {
    catalogue = Promise.resolve(provider.load(force))
      .then(indexCatalogue)
      .catch((e) => {
        catalogue = null; // allow a retry
        throw e;
      });
  }
  return catalogue;
}

/** Compact column-oriented form used to ship the catalogue to the browser. */
export async function catalogueColumns() {
  const cat = await loadCatalogue();
  return {
    cols: ["id", "brandName", "type", "dosageForm", "generic", "strength", "manufacturer"],
    rows: cat.items.map((m) => [m.id, m.brandName, m.type, m.dosageForm, m.generic, m.strength, m.manufacturer]),
  };
}

export function recordsFromColumns(data: { cols: string[]; rows: (string | number)[][] }): MedicineRecord[] {
  const ix = (c: string) => data.cols.indexOf(c);
  const [i0, i1, i2, i3, i4, i5, i6] = ["id", "brandName", "type", "dosageForm", "generic", "strength", "manufacturer"].map(ix);
  return data.rows.map((r) => ({
    id: Number(r[i0]),
    brandName: String(r[i1]),
    type: String(r[i2]),
    slug: "",
    dosageForm: String(r[i3]),
    generic: String(r[i4]),
    strength: String(r[i5]),
    manufacturer: String(r[i6]),
    packageContainer: "",
    packageSize: "",
  }));
}

/** Warm the cache in the background (called after login). */
export function prefetchCatalogue() {
  void loadCatalogue().catch(() => undefined);
}

export async function searchMedicines(q: string, form: string, limit: number) {
  const cat = await loadCatalogue();
  const needle = q.trim().toLowerCase();
  const out: MedicineRecord[] = [];

  if (!needle) {
    for (const m of cat.items) {
      if (form && m.dosageForm !== form) continue;
      out.push(m);
      if (out.length >= limit) break;
    }
    return { items: out, total: out.length };
  }

  const seen = new Set<number>();
  // pass 1: brand-name prefix matches
  for (let i = 0; i < cat.items.length && out.length < limit; i++) {
    const m = cat.items[i];
    if (form && m.dosageForm !== form) continue;
    if (cat.lower[i].brand.startsWith(needle)) {
      out.push(m);
      seen.add(m.id);
    }
  }
  // pass 2: contains on brand / generic / manufacturer / strength
  for (let i = 0; i < cat.items.length && out.length < limit; i++) {
    const m = cat.items[i];
    if (seen.has(m.id)) continue;
    if (form && m.dosageForm !== form) continue;
    const l = cat.lower[i];
    if (
      l.brand.includes(needle) ||
      l.generic.includes(needle) ||
      l.manufacturer.includes(needle) ||
      l.strength.includes(needle)
    ) {
      out.push(m);
    }
  }
  return { items: out, total: out.length };
}

export async function dosageForms(): Promise<string[]> {
  return (await loadCatalogue()).forms;
}

export async function catalogueStats() {
  return (await loadCatalogue()).stats;
}

/** "Re-import": re-reads the source (CSV / Medicines sheet) and returns the import report. */
export async function reimportCatalogue(): Promise<ImportReport> {
  catalogue = null;
  return (await loadCatalogue(true)).report;
}
