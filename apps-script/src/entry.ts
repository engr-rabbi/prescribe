// Web-app entry points. The deployed URL is public (browsers must be able to call it
// cross-origin), but EVERY call except `health` and `login` needs a valid signed session
// token, and the spreadsheet / Drive folders themselves are private to the owner account.
//
// Protocol: POST (Content-Type text/plain — avoids a CORS pre-flight) with a JSON body
//   { token, method, path, body }   →   { ok: true, data } | { ok: false, status, error }

import { installSyncPromise } from "./syncpromise";
installSyncPromise(); // must run before any handler code is evaluated

import { handleRequest } from "../../src/lib/local-backend/router";
import { beginServerRequest, endServerRequest } from "../../src/lib/local-backend/store";
import { clearSheetCaches, resetSpreadsheetHandle } from "./sheets";
import { ctx, installPlatform, persistence } from "./platform";
import { runtime } from "../../src/lib/local-backend/runtime";
import { audit } from "../../src/lib/local-backend/core";
import { SyncPromise } from "./syncpromise";
import { runSetup } from "./setup";
import { hashPassword, newId } from "../../src/lib/local-backend/crypto";
import { tables, touch } from "../../src/lib/local-backend/store";

const VERSION = "1.0.0";
const MAX_BODY = 12 * 1024 * 1024;

function json(obj: unknown) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function run<T>(p: Promise<T>): T {
  return (p as unknown as SyncPromise<T>).settle();
}

let platformReady = false;
function boot() {
  if (!platformReady) {
    installPlatform();
    platformReady = true;
  }
  persistence.reset();
  resetSpreadsheetHandle();
  beginServerRequest();
}

export function doGet() {
  return json({ ok: true, data: { service: "Smart Rx Google backend", version: VERSION } });
}

export function doPost(e: any) {
  let lock: any = null;
  try {
    const raw: string = e?.postData?.contents ?? "";
    if (raw.length > MAX_BODY) return json({ ok: false, status: 413, error: "Request too large" });
    let req: { token?: string | null; method?: string; path?: string; body?: unknown };
    try {
      req = JSON.parse(raw);
    } catch {
      return json({ ok: false, status: 400, error: "Malformed request" });
    }
    const path = String(req.path ?? "");
    const method = String(req.method ?? "GET").toUpperCase();
    if (!path.startsWith("/api/") && path !== "/health") return json({ ok: false, status: 400, error: "Bad path" });
    if (path === "/health") return doGet();

    boot();
    ctx.token = typeof req.token === "string" ? req.token : null;

    // writers are serialised; readers run lock-free against the cached snapshot
    if (method !== "GET") {
      lock = LockService.getScriptLock();
      lock.waitLock(25_000);
    }
    const data = run(handleRequest(path, { method, body: req.body === undefined ? undefined : JSON.stringify(req.body) }));
    endServerRequest(); // flush changed rows + audit trail to Sheets
    return json({ ok: true, data });
  } catch (err) {
    const status = typeof (err as { status?: number }).status === "number" ? (err as { status: number }).status : 400;
    const message = err && typeof (err as { message?: unknown }).message === "string" ? (err as { message: string }).message : "Request failed";
    if (message === "Internal server error") console.error(err);
    return json({ ok: false, status, error: message });
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch {
        /* ignore */
      }
    }
  }
}

// ----- editor-run helpers & triggers -----------------------------------------

export function setup() {
  const msg = runSetup();
  console.log(msg);
  return msg;
}

/** Time-driven trigger (installed by setup): spreadsheet copy → Drive/System Backups. */
export function dailyBackup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60_000);
  try {
    boot();
    const row = runtime.backup!.run("", "system@trigger");
    audit(null, "BACKUP", "FILE", row.id, `scheduled: ${row.name}`);
    endServerRequest();
    console.log(`Backup created: ${row.name}`);
  } finally {
    lock.releaseLock();
  }
}

export function clearCaches() {
  clearSheetCaches();
  console.log("Cache cleared");
}

/** Quick sanity check you can run from the editor after setup. */
export function selfTest() {
  boot();
  const sheets = ["Users", "Patients", "Prescriptions", "Medicines", "Files", "AuditLogs"];
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"));
  const out = sheets.map((n) => `${n}: ${ss.getSheetByName(n)?.getLastRow() ?? "MISSING"} rows`);
  console.log(out.join("\n"));
  return out;
}

/**
 * Recovery helper — run from the Apps Script editor when you can't log in as admin.
 * Reads Script Properties ADMIN_EMAIL + ADMIN_PASSWORD (min. 10 chars), creates the Super Admin
 * if missing or resets that account's password / re-activates it, clears the login lock-out,
 * then deletes ADMIN_PASSWORD again.
 */
export function resetAdminPassword() {
  const p = PropertiesService.getScriptProperties();
  const email = (p.getProperty("ADMIN_EMAIL") || "").trim().toLowerCase();
  const password = p.getProperty("ADMIN_PASSWORD") || "";
  if (!email || password.length < 10) {
    throw new Error("Set Script Properties ADMIN_EMAIL and ADMIN_PASSWORD (min. 10 characters) first");
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30_000);
  try {
    boot();
    const hash = run(hashPassword(password) as Promise<string>);
    const now = new Date().toISOString();
    const existing = tables.users.find((u) => u.email === email);
    if (existing) {
      existing.passwordHash = hash;
      existing.active = true;
      existing.role = "SUPER_ADMIN";
      existing.updatedAt = now;
    } else {
      tables.users.push({ id: newId(), email, name: "System Administrator", role: "SUPER_ADMIN", passwordHash: hash, active: true, createdAt: now, updatedAt: now });
    }
    touch("users");
    audit(null, "UPDATE", "USER", existing?.id ?? "", `admin password reset via Apps Script for ${email}`);
    endServerRequest();
    CacheService.getScriptCache().remove(`rx:fail:${email}`);
    clearSheetCaches();
    p.deleteProperty("ADMIN_PASSWORD");
    const msg = `${existing ? "Password reset" : "Admin created"} for ${email}. You can log in now.`;
    console.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}
