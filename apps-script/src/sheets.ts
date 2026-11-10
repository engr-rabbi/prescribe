// Google Sheets persistence for the shared backend core.
//
//  • one worksheet per table (see schema.ts), header row validated on load
//  • reads: CacheService first (gzip + chunked), then ONE getDataRange() per sheet
//  • writes: only the rows that changed (diff against what was loaded in this request),
//    batched; the Script lock is held by the caller so writers never interleave
//  • derived "view" sheets (FollowUps, PatientMedicalHistory) are kept in sync
//  • the whole thing sits behind ServerPersistence — swap it for a SQL adapter to
//    migrate to PostgreSQL without touching the handlers

import type { AuditRow, ServerPersistence, TableName } from "../../src/lib/local-backend/store";
import { tables } from "../../src/lib/local-backend/store";
import { ALL_SHEET_NAMES, EXTRA_SHEETS, TABLE_SHEETS, type Col, type SheetSpec } from "./schema";
import { audit as AUDIT_COLS } from "./schema-audit";

type Row = Record<string, unknown>;

const CACHE_TTL = 600; // seconds — manual edits made in Sheets show up within 10 min (or use "clear cache")
const CHUNK = 90_000;

// ---------------------------------------------------------------------------
// value coercion
// ---------------------------------------------------------------------------

function fromCell(v: unknown, col: Col): unknown {
  switch (col.type) {
    case "s":
      if (v === null || v === undefined) return "";
      if (v instanceof Date) return v.toISOString();
      return String(v);
    case "sn":
      if (v === null || v === undefined || v === "") return null;
      if (v instanceof Date) return v.toISOString();
      return String(v);
    case "n": {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    case "nn": {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "b":
      return v === true || v === "TRUE" || v === "true" || v === 1;
  }
}

function toCell(v: unknown, col: Col): unknown {
  switch (col.type) {
    case "s":
    case "sn":
      return v === null || v === undefined ? "" : String(v);
    case "n":
      return Number(v) || 0;
    case "nn":
      return v === null || v === undefined || v === "" ? "" : Number(v);
    case "b":
      return !!v;
  }
}

const rowToValues = (row: Row, cols: Col[]) => cols.map((c) => toCell(row[c.key], c));
const keyOf = (row: Row, cols: Col[]) => JSON.stringify(rowToValues(row, cols));

// ---------------------------------------------------------------------------
// cache (gzip → base64 → 90 kB chunks)
// ---------------------------------------------------------------------------

function cacheSet(key: string, json: string) {
  try {
    const cache = CacheService.getScriptCache();
    const gz = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, "application/json")).getBytes());
    const n = Math.ceil(gz.length / CHUNK) || 1;
    const entries: Record<string, string> = { [`${key}:meta`]: String(n) };
    for (let i = 0; i < n; i++) entries[`${key}:${i}`] = gz.slice(i * CHUNK, (i + 1) * CHUNK);
    cache.putAll(entries, CACHE_TTL);
  } catch {
    cacheDrop(key); // too big / quota — fall back to reading the sheet
  }
}

function cacheGet(key: string): string | null {
  try {
    const cache = CacheService.getScriptCache();
    const meta = cache.get(`${key}:meta`);
    if (!meta) return null;
    const n = Number(meta);
    const keys: string[] = [];
    for (let i = 0; i < n; i++) keys.push(`${key}:${i}`);
    const got = cache.getAll(keys);
    let gz = "";
    for (const k of keys) {
      if (got[k] === undefined || got[k] === null) return null;
      gz += got[k];
    }
    return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(gz), "application/x-gzip")).getDataAsString();
  } catch {
    return null;
  }
}

function cacheDrop(key: string) {
  try {
    const cache = CacheService.getScriptCache();
    const meta = cache.get(`${key}:meta`);
    const keys = [`${key}:meta`];
    for (let i = 0; i < Number(meta || 0); i++) keys.push(`${key}:${i}`);
    cache.removeAll(keys);
  } catch {
    /* ignore */
  }
}

export function clearSheetCaches() {
  for (const name of ALL_SHEET_NAMES) cacheDrop(`rx:sheet:${name}`);
}

// ---------------------------------------------------------------------------
// spreadsheet access
// ---------------------------------------------------------------------------

let ssCache: any = null;
export function spreadsheet() {
  if (!ssCache) {
    const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    if (!id) throw new Error("SPREADSHEET_ID is not configured — run setup() first");
    ssCache = SpreadsheetApp.openById(id);
  }
  return ssCache;
}
export function resetSpreadsheetHandle() {
  ssCache = null;
}

/** Make sure the worksheet has room (new sheets only have 1000 rows). Inserted rows inherit the column formats. */
export function ensureCapacity(sh: any, lastRowNeeded: number) {
  const max = sh.getMaxRows();
  if (lastRowNeeded > max) sh.insertRowsAfter(max, lastRowNeeded - max + 1000);
}

function worksheet(name: string) {
  const sh = spreadsheet().getSheetByName(name);
  if (!sh) throw new Error(`Worksheet "${name}" is missing — run setup() again`);
  return sh;
}

interface Loaded {
  rows: Row[];
  /** id → actual sheet row number (1-based) */
  rowNo: Map<string, number>;
  snap: Map<string, string>;
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

export class SheetsPersistence implements ServerPersistence {
  private loaded = new Map<string, Loaded>(); // by sheet name
  /** prescription ids touched by the last save (for the derived sheets) */
  private changedRx: { upserts: string[]; deletes: string[] } = { upserts: [], deletes: [] };

  reset() {
    this.loaded.clear();
  }

  // ----- read -----

  private readSheet(spec: { sheet: string; cols: Col[]; filter?: SheetSpec["filter"] }): Loaded {
    const hit = this.loaded.get(spec.sheet);
    if (hit) return hit;

    const key = `rx:sheet:${spec.sheet}`;
    let rows: Row[] = [];
    let rowNo = new Map<string, number>();
    const cached = cacheGet(key);
    if (cached) {
      const parsed = JSON.parse(cached) as { rows: Row[]; rowNo: [string, number][] };
      rows = parsed.rows;
      rowNo = new Map(parsed.rowNo);
    } else {
      const sh = worksheet(spec.sheet);
      const last = sh.getLastRow();
      if (last >= 1) {
        const values: unknown[][] = sh.getRange(1, 1, last, spec.cols.length).getValues();
        const header = values[0].map(String);
        spec.cols.forEach((c, i) => {
          if (header[i] !== c.key) {
            throw new Error(`Sheet "${spec.sheet}" column ${i + 1} is "${header[i]}", expected "${c.key}"`);
          }
        });
        for (let r = 1; r < values.length; r++) {
          const raw = values[r];
          const id = raw[0];
          if (id === "" || id === null || id === undefined) continue; // blank row
          const obj: Row = {};
          spec.cols.forEach((c, i) => (obj[c.key] = fromCell(raw[i], c)));
          if (rowNo.has(String(obj.id))) continue; // duplicate id — first one wins
          rowNo.set(String(obj.id), r + 1);
          rows.push(obj);
        }
      }
      cacheSet(key, JSON.stringify({ rows, rowNo: [...rowNo] }));
    }
    const snap = new Map<string, string>();
    for (const r of rows) snap.set(String(r.id), keyOf(r, spec.cols));
    const entry = { rows, rowNo, snap };
    this.loaded.set(spec.sheet, entry);
    return entry;
  }

  loadTable(name: TableName): unknown[] {
    const specs = TABLE_SHEETS.filter((s) => s.table === name);
    if (!specs.length) return []; // sessions, fileBlobs, auditLogs — not stored in sheets
    const out: Row[] = [];
    for (const spec of specs) {
      // a copy: handlers mutate rows in place, the snapshot keeps the original values
      for (const r of this.readSheet(spec).rows) out.push({ ...r });
    }
    return out;
  }

  // ----- write -----

  saveTables(names: TableName[]) {
    for (const name of names) {
      const specs = TABLE_SHEETS.filter((s) => s.table === name);
      if (!specs.length) continue;
      const all = (tables as unknown as Record<string, Row[]>)[name];
      for (const spec of specs) {
        const mine = spec.filter ? all.filter(spec.filter) : all;
        this.saveSheet(spec, mine);
      }
      if (specs.length > 1) {
        // every row must belong to exactly one sheet of the table
        const placed = specs.reduce((n, s) => n + (s.filter ? all.filter(s.filter).length : all.length), 0);
        if (placed !== all.length) throw new Error(`Rows of ${name} do not match any sheet (unknown category?)`);
      }
    }
    if (names.includes("prescriptions")) this.syncDerivedSheets();
  }

  private saveSheet(spec: { sheet: string; cols: Col[]; table?: TableName }, current: Row[]) {
    const state = this.readSheet(spec);
    const sh = worksheet(spec.sheet);
    const ncol = spec.cols.length;

    const currentById = new Map<string, Row>();
    for (const r of current) currentById.set(String(r.id), r);
    const updates: string[] = [];
    const appends: string[] = [];
    for (const [id, row] of currentById) {
      const was = state.snap.get(id);
      if (was === undefined) appends.push(id);
      else if (was !== keyOf(row, spec.cols)) updates.push(id);
    }
    const deletes: string[] = [];
    for (const id of state.snap.keys()) if (!currentById.has(id)) deletes.push(id);
    if (!updates.length && !appends.length && !deletes.length) return;

    if (spec.sheet === "Prescriptions") {
      this.changedRx = { upserts: [...updates, ...appends], deletes: [...deletes] };
    }

    for (const id of updates) {
      sh.getRange(state.rowNo.get(id), 1, 1, ncol).setValues([rowToValues(currentById.get(id)!, spec.cols)]);
    }
    // delete bottom-up so earlier row numbers stay valid
    const delRows = deletes.map((id) => state.rowNo.get(id)!).sort((a, b) => b - a);
    for (const r of delRows) sh.deleteRow(r);
    if (appends.length) {
      const start = sh.getLastRow() + 1;
      ensureCapacity(sh, start + appends.length);
      sh.getRange(start, 1, appends.length, ncol).setValues(
        appends.map((id) => rowToValues(currentById.get(id)!, spec.cols))
      );
    }

    // refresh in-request state + cache from what we just wrote
    cacheDrop(`rx:sheet:${spec.sheet}`);
    this.loaded.delete(spec.sheet);
  }

  appendAudit(rows: AuditRow[]) {
    if (!rows.length) return;
    const sh = worksheet("AuditLogs");
    const start = sh.getLastRow() + 1;
    ensureCapacity(sh, start + rows.length);
    sh.getRange(start, 1, rows.length, AUDIT_COLS.length).setValues(
      rows.map((r) => AUDIT_COLS.map((c) => toCell((r as unknown as Row)[c.key], c)))
    );
  }

  readAudit(limit: number): AuditRow[] {
    const sh = worksheet("AuditLogs");
    const last = sh.getLastRow();
    if (last < 2) return [];
    const start = Math.max(2, last - limit + 1);
    const values: unknown[][] = sh.getRange(start, 1, last - start + 1, AUDIT_COLS.length).getValues();
    return values
      .filter((v) => v[0] !== "")
      .map((v) => {
        const o: Row = {};
        AUDIT_COLS.forEach((c, i) => (o[c.key] = fromCell(v[i], c)));
        return o as unknown as AuditRow;
      });
  }

  // ----- derived, read-only "view" sheets -----

  private syncDerivedSheets() {
    const rx = (tables.prescriptions as unknown as Row[]);
    const patients = tables.patients as unknown as Row[];
    const upserts = this.changedRx.upserts;
    const deletes = this.changedRx.deletes;
    this.changedRx = { upserts: [], deletes: [] };
    if (!upserts.length && !deletes.length) return;

    const mk = (sheetName: string, build: (r: Row, patient: Row | undefined) => unknown[] | null) => {
      const extra = EXTRA_SHEETS.find((s) => s.sheet === sheetName)!;
      const sh = worksheet(sheetName);
      const last = sh.getLastRow();
      const ids: string[] = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map((v: unknown[]) => String(v[0])) : [];
      const rowOf = new Map(ids.map((id, i) => [id, i + 2]));
      const now = new Date().toISOString();
      const toAppend: unknown[][] = [];
      for (const id of upserts) {
        const r = rx.find((x) => String(x.id) === id);
        if (!r) continue;
        const patient = patients.find((p) => p.id === r.patientId);
        const built = build(r, patient);
        const values = built ? built.concat([now]) : null;
        const at = rowOf.get(id);
        if (!values) {
          if (at) {
            sh.deleteRow(at);
            for (const [k, v] of rowOf) if (v > at) rowOf.set(k, v - 1);
            rowOf.delete(id);
          }
        } else if (at) sh.getRange(at, 1, 1, extra.cols.length).setValues([values]);
        else toAppend.push(values);
      }
      const gone = deletes.map((id) => rowOf.get(id)).filter((n): n is number => !!n).sort((a, b) => b - a);
      for (const n of gone) sh.deleteRow(n);
      if (toAppend.length) {
        const at = sh.getLastRow() + 1;
        ensureCapacity(sh, at + toAppend.length);
        sh.getRange(at, 1, toAppend.length, extra.cols.length).setValues(toAppend);
      }
    };

    mk("FollowUps", (r, p) =>
      r.followUpDate
        ? [
            r.id,
            r.id,
            r.code,
            r.patientId,
            p?.code ?? "",
            r.doctorId,
            r.followUpDate,
            r.followUpNote ?? "",
            r.status === "FINALIZED" ? "SCHEDULED" : "DRAFT",
          ]
        : null
    );
    mk("PatientMedicalHistory", (r, p) => {
      const h = safeJSON(String(r.history ?? "{}"));
      const vals = [
        h.presentIllness,
        h.pastMedical,
        h.pastSurgical,
        h.drugHistory,
        h.familyHistory,
        h.personalHistory,
        h.socialHistory,
        h.allergyHistory,
      ].map((v) => v ?? "");
      if (!vals.some((v) => v !== "")) return null;
      return [r.id, r.id, r.patientId, p?.code ?? "", r.prescriptionDate, ...vals];
    });
  }
}

function safeJSON(s: string): Record<string, string> {
  try {
    return JSON.parse(s) ?? {};
  } catch {
    return {};
  }
}
