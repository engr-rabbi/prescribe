// One-time (idempotent) provisioning: Drive folder tree, the database spreadsheet with
// all worksheets, seed data, secrets and triggers. Run `setup` from the Apps Script editor.

import { newId, hashPassword } from "../../src/lib/local-backend/crypto";
import { TOP_FOLDERS } from "../../src/lib/local-backend/files";
import { parseCatalogueCSV } from "../../src/lib/local-backend/medicines";
import { installPlatform } from "./platform";
import { ensureCapacity, resetSpreadsheetHandle } from "./sheets";
import { ALL_SHEET_NAMES, EXTRA_SHEETS, ROLE_MATRIX, TABLE_SHEETS, type Col } from "./schema";
import { fromHex, toHex } from "./sha256";

const props = () => PropertiesService.getScriptProperties();

function randomSecret(bytes: number): string {
  let hex = "";
  while (hex.length < bytes * 2) hex += Utilities.getUuid().replace(/-/g, "");
  return hex.slice(0, bytes * 2);
}

function fetchSeed(base: string, file: string): string {
  const url = `${base.replace(/\/$/, "")}/${file}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error(`Could not download ${url} (HTTP ${res.getResponseCode()})`);
  return res.getContentText();
}

function cellValue(v: unknown, c: Col): unknown {
  switch (c.type) {
    case "b":
      return !!v;
    case "n":
      return Number(v) || 0;
    case "nn":
      return v === null || v === undefined || v === "" ? "" : Number(v);
    default:
      return v === null || v === undefined ? "" : String(v);
  }
}

/** Batch-write rows below the header, in chunks (keeps each call well within Sheets limits). */
function writeRows(ss: any, sheetName: string, cols: Col[], rows: Record<string, unknown>[], chunk = 2000) {
  if (!rows.length) return;
  const sh = ss.getSheetByName(sheetName);
  ensureCapacity(sh, sh.getLastRow() + rows.length + 1);
  let at = sh.getLastRow() + 1;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk).map((r) => cols.map((c) => cellValue(r[c.key], c)));
    sh.getRange(at, 1, part.length, cols.length).setValues(part);
    at += part.length;
  }
}

function isEmpty(ss: any, sheetName: string): boolean {
  return ss.getSheetByName(sheetName).getLastRow() < 2;
}

function ensureSheets(ss: any) {
  const specs: { sheet: string; description: string; cols: Col[] }[] = [];
  const seen = new Set<string>();
  for (const s of [...TABLE_SHEETS, ...EXTRA_SHEETS]) {
    if (seen.has(s.sheet)) continue;
    seen.add(s.sheet);
    specs.push(s);
  }
  const first = ss.getSheets()[0];
  specs.forEach((spec, i) => {
    let sh = ss.getSheetByName(spec.sheet);
    if (!sh) {
      sh = i === 0 && first.getName() === "Sheet1" ? first.setName(spec.sheet) : ss.insertSheet(spec.sheet);
    }
    const header = spec.cols.map((c) => c.key);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold").setBackground("#e6f4f1");
    sh.setFrozenRows(1);
    sh.getRange(1, 1).setNote(spec.description);
    // text columns are formatted as plain text so Sheets never turns "01712…" or "2026-11-08…" into numbers/dates
    const rows = Math.max(sh.getMaxRows() - 1, 1);
    spec.cols.forEach((c, ci) => {
      if (c.type === "s" || c.type === "sn") sh.getRange(2, ci + 1, rows, 1).setNumberFormat("@");
    });
  });
}

export function runSetup(): string {
  installPlatform();
  const p = props();
  const adminEmail = (p.getProperty("ADMIN_EMAIL") || "").trim().toLowerCase();
  const adminPassword = p.getProperty("ADMIN_PASSWORD") || "";
  const seedBase = p.getProperty("SEED_BASE_URL") || "";
  if (!p.getProperty("SPREADSHEET_ID")) {
    if (!adminEmail || adminPassword.length < 10) {
      throw new Error("Set Script Properties ADMIN_EMAIL and ADMIN_PASSWORD (min. 10 characters) before the first run");
    }
    if (!seedBase) throw new Error("Set Script Property SEED_BASE_URL (the site's /data folder, e.g. https://user.github.io/repo/data)");
  }

  // 1. secrets (never leave Script Properties)
  if (!p.getProperty("SESSION_SECRET")) p.setProperty("SESSION_SECRET", randomSecret(48));
  if (!p.getProperty("PASSWORD_PEPPER")) p.setProperty("PASSWORD_PEPPER", randomSecret(32));
  if (!p.getProperty("BACKUP_RETENTION")) p.setProperty("BACKUP_RETENTION", "30");

  // 2. Drive folder tree
  let root: any;
  const rootId = p.getProperty("ROOT_FOLDER_ID");
  if (rootId) root = DriveApp.getFolderById(rootId);
  else {
    root = DriveApp.createFolder("Smart Prescription System");
    p.setProperty("ROOT_FOLDER_ID", root.getId());
  }
  for (const name of TOP_FOLDERS) {
    const it = root.getFoldersByName(name);
    if (!it.hasNext()) root.createFolder(name);
  }

  // 3. database spreadsheet
  let ss: any;
  const ssId = p.getProperty("SPREADSHEET_ID");
  if (ssId) ss = SpreadsheetApp.openById(ssId);
  else {
    ss = SpreadsheetApp.create("Smart Prescription System — Database");
    DriveApp.getFileById(ss.getId()).moveTo(root);
    p.setProperty("SPREADSHEET_ID", ss.getId());
  }
  resetSpreadsheetHandle();
  ensureSheets(ss);
  const now = new Date().toISOString();

  // 4. seed (only into empty sheets — safe to re-run)
  if (isEmpty(ss, "Roles")) {
    writeRows(ss, "Roles", EXTRA_SHEETS.find((s) => s.sheet === "Roles")!.cols, ROLE_MATRIX.map(([role, permission, allowed, description]) => ({ role, permission, allowed, description })));
  }
  if (isEmpty(ss, "SystemSettings")) {
    writeRows(ss, "SystemSettings", EXTRA_SHEETS.find((s) => s.sheet === "SystemSettings")!.cols, [
      { key: "schema_version", value: "1", description: "Sheet layout version", updatedAt: now },
      { key: "backup_retention_count", value: p.getProperty("BACKUP_RETENTION"), description: "Number of backup copies kept in Drive", updatedAt: now },
      { key: "session_days", value: "7", description: "Login validity", updatedAt: now },
      { key: "max_upload_mb", value: "8", description: "Largest accepted upload", updatedAt: now },
    ]);
  }
  const demo = (p.getProperty("SEED_DEMO") || "").toLowerCase() === "true";
  if (isEmpty(ss, "Users")) {
    const users: Record<string, unknown>[] = [];
    // (async fn result is already settled — the SyncPromise polyfill is installed)
    const hash = (pw: string) => {
      let out = "";
      void Promise.resolve(hashPassword(pw)).then((h) => (out = h));
      return out;
    };
    if (demo) {
      const seed = JSON.parse(fetchSeed(seedBase, "seed.json"));
      for (const u of seed.users) users.push({ ...u, passwordHash: hash(seed.defaultPasswords[u.email] || randomSecret(8)) });
      const w = (sheet: string, key: string) => writeRows(ss, sheet, TABLE_SHEETS.find((s) => s.sheet === sheet)!.cols, seed[key]);
      w("Doctors", "doctors");
      w("Chambers", "chambers");
      w("Patients", "patients");
      w("Prescriptions", "prescriptions");
      w("PrescriptionMedicines", "prescriptionMedicines");
      w("Templates", "templates");
    } else {
      users.push({ id: newId(), email: adminEmail, name: "System Administrator", role: "SUPER_ADMIN", passwordHash: hash(adminPassword), active: true, createdAt: now, updatedAt: now });
    }
    writeRows(ss, "Users", TABLE_SHEETS.find((s) => s.sheet === "Users")!.cols, users);
  }
  if (isEmpty(ss, "ChiefComplaints")) {
    const lib = JSON.parse(fetchSeed(seedBase, "libraries.json")) as { cols: string[]; rows: unknown[][] };
    const items: Record<string, unknown>[] = lib.rows.map((r) => {
      const o: Record<string, unknown> = {};
      lib.cols.forEach((c, i) => (o[c] = r[i]));
      return { ...o, isCustom: false, createdById: "", createdAt: now };
    });
    const bySheet: Record<string, string> = { COMPLAINT: "ChiefComplaints", HISTORY: "HistoryPresets", EXAM: "ExamFindings", DIAGNOSIS: "Diagnoses", INVESTIGATION: "Investigations", ADVICE: "Advice" };
    const libCols = TABLE_SHEETS.find((s) => s.sheet === "ChiefComplaints")!.cols;
    for (const [cat, sheet] of Object.entries(bySheet)) {
      writeRows(ss, sheet, libCols, items.filter((i) => i.category === cat));
    }
  }
  if (isEmpty(ss, "Medicines")) {
    const parsed = parseCatalogueCSV(fetchSeed(seedBase, "medicines.csv"));
    writeRows(ss, "Medicines", EXTRA_SHEETS.find((s) => s.sheet === "Medicines")!.cols, parsed.items as never, 3000);
    p.setProperty("MEDICINES_VERSION", String(Date.now()));
  }

  // 5. secrets that must not linger
  p.deleteProperty("ADMIN_PASSWORD");

  // 6. nightly backup trigger (idempotent)
  for (const t of ScriptApp.getProjectTriggers()) if (t.getHandlerFunction() === "dailyBackup") ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger("dailyBackup").timeBased().everyDays(1).atHour(2).create();

  return [
    "Setup complete.",
    `Database: ${ss.getUrl()}`,
    `Drive root: https://drive.google.com/drive/folders/${root.getId()}`,
    `Sheets: ${ALL_SHEET_NAMES.length} · admin: ${adminEmail || "(existing)"}`,
    "Next: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) and copy the /exec URL.",
  ].join("\n");
}

export { fromHex, toHex };
