// Platform hooks. The shared handlers never talk to localStorage, IndexedDB,
// Google Drive, … directly — they go through this registry. Defaults below are
// the browser/local implementations; the Apps Script build overrides them
// (apps-script/src/platform.ts) and the remote client doesn't use them at all.

import { HttpError } from "./errors";
import { newId, newToken } from "./crypto";
import { tables, touch, type AuditRow, type FileRow } from "./store";

// ----- sessions ------------------------------------------------------------

export interface SessionProvider {
  currentToken(): string | null;
  /** Create a session for the user; returns the token (also remembered as current). */
  create(userId: string): string;
  destroy(): void;
  userIdFor(token: string): string | null;
}

const SESSION_KEY = "rx_session";
const SESSION_DAYS = 7;
let memoryToken: string | null = null;

function writeToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) window.localStorage.setItem(SESSION_KEY, token);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked — session lives in memory only */
  }
}

export const localSessions: SessionProvider = {
  currentToken() {
    try {
      return window.localStorage.getItem(SESSION_KEY);
    } catch {
      return memoryToken;
    }
  },
  create(userId) {
    const token = newToken();
    const now = Date.now();
    tables.sessions = tables.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    tables.sessions.push({
      id: token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
    });
    touch("sessions");
    writeToken(token);
    return token;
  },
  destroy() {
    const token = this.currentToken();
    if (token) {
      tables.sessions = tables.sessions.filter((s) => s.id !== token);
      touch("sessions");
    }
    writeToken(null);
  },
  userIdFor(token) {
    const s = tables.sessions.find((x) => x.id === token);
    return s && new Date(s.expiresAt).getTime() >= Date.now() ? s.userId : null;
  },
};

// ----- login throttling ----------------------------------------------------

export interface Throttle {
  assertAllowed(key: string): void;
  recordFailure(key: string): void;
  clear(key: string): void;
}

const MAX_FAILS = 6;
const LOCK_MS = 15 * 60_000;
const fails = new Map<string, { n: number; first: number }>();

export const memoryThrottle: Throttle = {
  assertAllowed(key) {
    const f = fails.get(key);
    if (f && f.n >= MAX_FAILS && Date.now() - f.first < LOCK_MS) {
      throw new HttpError(429, "Too many failed attempts — try again in 15 minutes");
    }
  },
  recordFailure(key) {
    const f = fails.get(key);
    if (!f || Date.now() - f.first >= LOCK_MS) fails.set(key, { n: 1, first: Date.now() });
    else f.n++;
  },
  clear(key) {
    fails.delete(key);
  },
};

// ----- doctor images (photo / signature / logo) ----------------------------

export type AssetKind = "DOCTOR_PHOTO" | "DOCTOR_SIGNATURE" | "CLINIC_LOGO";

export interface AssetStore {
  /** Persist an image data-URL and return the reference stored in the doctor row. */
  store(doctorId: string, kind: AssetKind, value: string, userId: string): string;
  /** Turn a stored reference back into something an <img src> can show. */
  resolve(value: string): string;
}

export const inlineAssets: AssetStore = {
  store: (_d, _k, value) => value,
  resolve: (value) => value,
};

// ----- file bytes (kept apart from the registry rows) -----------------------

export interface FileBackend {
  /** Store the bytes; returns the storage key recorded in the registry. */
  write(meta: Omit<FileRow, "storageKey">, dataBase64: string): string;
  read(row: FileRow): string;
  remove(row: FileRow): void;
}

export const localFiles: FileBackend = {
  write(meta, dataBase64) {
    const id = newId();
    tables.fileBlobs.push({ id, dataBase64 });
    touch("fileBlobs");
    return id;
  },
  read(row) {
    const blob = tables.fileBlobs.find((b) => b.id === row.storageKey);
    if (!blob) throw new HttpError(404, "File content not found");
    return blob.dataBase64;
  },
  remove(row) {
    tables.fileBlobs = tables.fileBlobs.filter((b) => b.id !== row.storageKey);
    touch("fileBlobs");
  },
};

// ----- backups -------------------------------------------------------------

export interface BackupProvider {
  /** Create a full backup now and return its registry row. */
  run(userId: string, userEmail: string): FileRow;
}

// ----- registry ------------------------------------------------------------

export const runtime: {
  /** changes whenever the medicine catalogue is re-imported */
  catalogueVersion(): string;
  /** UTF-8 text → base64 (platform specific) */
  encodeBase64(text: string): string;
  /** newest-last audit rows (up to `limit`) */
  readAudit(limit: number): AuditRow[];
  sessions: SessionProvider;
  throttle: Throttle;
  assets: AssetStore;
  files: FileBackend;
  backup: BackupProvider | null;
  /** Read-only reference data (medicine catalogue) served by the store itself. */
  label: "local" | "google";
} = {
  catalogueVersion: () => "1",
  encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  readAudit: (limit) => tables.auditLogs.slice(-limit),
  sessions: localSessions,
  throttle: memoryThrottle,
  assets: inlineAssets,
  files: localFiles,
  backup: null,
  label: "local",
};
