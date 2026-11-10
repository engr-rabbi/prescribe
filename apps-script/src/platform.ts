// Installs the Apps Script implementations behind the shared backend core.

import { z } from "zod";
import { setCryptoProvider } from "../../src/lib/local-backend/crypto";
import { HttpError } from "../../src/lib/local-backend/errors";
import { runtime, type SessionProvider, type Throttle } from "../../src/lib/local-backend/runtime";
import { installServerMode, tables } from "../../src/lib/local-backend/store";
import { setCatalogueProvider, validateCatalogue } from "../../src/lib/local-backend/medicines";
import { driveAssets, driveBackup, driveFiles } from "./drive";
import { SheetsPersistence, spreadsheet } from "./sheets";
import { MEDICINES, type Col } from "./schema";
import { base64url, base64urlDecode, fromHex, hmacSha256, pbkdf2Sha256, toHex, utf8 } from "./sha256";

const props = () => PropertiesService.getScriptProperties();
const prop = (k: string) => props().getProperty(k) || "";

export const persistence = new SheetsPersistence();

/** Per-request context (a fresh execution per request in Apps Script). */
export const ctx: { token: string | null } = { token: null };

// ----- crypto ----------------------------------------------------------------

const ITERATIONS = 100_000;

function randomBytes(n: number): Uint8Array {
  let hex = "";
  while (hex.length < n * 2) hex += Utilities.getUuid().replace(/-/g, "");
  return fromHex(hex.slice(0, n * 2));
}

function passwordBytes(password: string): Uint8Array {
  const pepper = prop("PASSWORD_PEPPER");
  if (!pepper) throw new HttpError(500, "PASSWORD_PEPPER is not configured — run setup()");
  // the pepper lives only in Script Properties — a stolen copy of the sheet can't be brute-forced without it
  return utf8(`${pepper}:${password}`);
}

function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sha256(passwordBytes(password), salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

function verifyPasswordSync(password: string, stored: string): boolean {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const test = toHex(pbkdf2Sha256(passwordBytes(password), fromHex(salt), Number(iter)));
  let diff = test.length ^ hash.length;
  for (let i = 0; i < test.length && i < hash.length; i++) diff |= test.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// ----- stateless signed session tokens ---------------------------------------

const SESSION_MS = 7 * 86_400_000;

function secret(): Uint8Array {
  const s = prop("SESSION_SECRET");
  if (!s) throw new HttpError(500, "SESSION_SECRET is not configured — run setup()");
  return utf8(s);
}

const sessions: SessionProvider = {
  currentToken: () => ctx.token,
  create(userId) {
    const user = tables.users.find((u) => u.id === userId);
    const payload = JSON.stringify({ u: userId, e: Date.now() + SESSION_MS, v: (user?.passwordHash ?? "").slice(-10) });
    const body = base64url(utf8(payload));
    const sig = base64url(hmacSha256(secret(), utf8(body)));
    ctx.token = `${body}.${sig}`;
    return ctx.token;
  },
  destroy() {
    ctx.token = null; // stateless: the client simply discards its copy
  },
  userIdFor(token) {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expect = base64url(hmacSha256(secret(), utf8(body)));
    let diff = expect.length ^ sig.length;
    for (let i = 0; i < expect.length && i < sig.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return null;
    try {
      const p = JSON.parse(String.fromCharCode(...Array.from(base64urlDecode(body)))) as { u: string; e: number; v: string };
      if (typeof p.e !== "number" || p.e < Date.now()) return null;
      const user = tables.users.find((u) => u.id === p.u);
      // changing the password (or deactivating the user) invalidates outstanding tokens
      if (!user || !user.active || user.passwordHash.slice(-10) !== p.v) return null;
      return p.u;
    } catch {
      return null;
    }
  },
};

// ----- brute-force protection ------------------------------------------------

const MAX_FAILS = 6;
const LOCK_SECONDS = 900;
const throttle: Throttle = {
  assertAllowed(key) {
    const n = Number(CacheService.getScriptCache().get(`rx:fail:${key}`) || 0);
    if (n >= MAX_FAILS) throw new HttpError(429, "Too many failed attempts — try again in 15 minutes");
  },
  recordFailure(key) {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(`rx:fail:${key}`) || 0) + 1;
    cache.put(`rx:fail:${key}`, String(n), LOCK_SECONDS);
  },
  clear(key) {
    CacheService.getScriptCache().remove(`rx:fail:${key}`);
  },
};

// ----- medicine catalogue (Medicines sheet) ----------------------------------

function readMedicinesSheet(): Record<string, unknown>[] {
  const sh = spreadsheet().getSheetByName("Medicines");
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values: unknown[][] = sh.getRange(2, 1, last - 1, MEDICINES.length).getValues();
  return values.map((v) => {
    const o: Record<string, unknown> = {};
    MEDICINES.forEach((c: Col, i: number) => (o[c.key] = c.key === "id" ? Number(v[i]) : String(v[i] ?? "")));
    return o;
  });
}

// ----- install ---------------------------------------------------------------

export function installPlatform() {
  z.config({ jitless: true }); // Apps Script forbids eval / new Function
  setCryptoProvider({
    hashPassword: hashPasswordSync,
    verifyPassword: verifyPasswordSync,
    uuid: () => Utilities.getUuid(),
    randomHex: (n) => toHex(randomBytes(n)),
  });
  installServerMode(persistence);
  runtime.label = "google";
  runtime.sessions = sessions;
  runtime.throttle = throttle;
  runtime.assets = driveAssets;
  runtime.files = driveFiles;
  runtime.backup = driveBackup;
  runtime.encodeBase64 = (text) => Utilities.base64Encode(Utilities.newBlob(text).getBytes());
  runtime.readAudit = (limit) => persistence.readAudit(limit);
  runtime.catalogueVersion = () => prop("MEDICINES_VERSION") || "1";
  setCatalogueProvider({
    load(force) {
      const raw = readMedicinesSheet();
      void force;
      const out = validateCatalogue(raw as never);
      if (force) props().setProperty("MEDICINES_VERSION", String(Date.now()));
      return out;
    },
  });
}
