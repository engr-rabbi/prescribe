// In-memory relational store persisted to IndexedDB.
//
// The original app talked to Prisma/SQLite through Next.js API routes. GitHub
// Pages can only host static files, so the same tables now live in the browser:
// each table is an array held in memory (fast, synchronous queries) and written
// through to IndexedDB in the background. Other open tabs are kept in sync with
// a BroadcastChannel.

import type { Role } from "@/lib/types";
import { dataSource } from "./data-source";
import { hashPassword } from "./crypto";
import { idbAvailable, idbClear, idbGetAll, idbSetMany } from "./idb";

// ----- row types (dates are ISO strings) -----

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface SessionRow {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}
export interface DoctorRow {
  id: string;
  userId: string;
  fullName: string;
  professionalTitle: string;
  specialization: string;
  bmdcNo: string;
  designation: string;
  hospitalName: string;
  chamberAddress: string;
  phone: string;
  email: string;
  photoUrl: string;
  signatureUrl: string;
  logoUrl: string;
  consultationSchedule: string;
  headerNote: string;
  footerNote: string;
  activeTemplate: string;
  themeColor: string;
  fontFamily: string;
  headerLayout: string;
  showLogo: boolean;
  showPhoto: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface PatientRow {
  id: string;
  code: string;
  name: string;
  ageYears: number | null;
  ageMonths: number | null;
  dob: string | null;
  gender: string;
  mobile: string;
  address: string;
  weight: number | null;
  height: number | null;
  bloodGroup: string;
  allergies: string;
  medicalHistory: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface RxRow {
  id: string;
  code: string;
  patientId: string;
  doctorId: string;
  status: string;
  version: number;
  rootId: string | null;
  revisionNote: string;
  supersededById: string | null;
  prescriptionDate: string;
  chiefComplaints: string;
  history: string;
  examination: string;
  diagnosis: string;
  investigations: string;
  advice: string;
  followUpDate: string | null;
  followUpNote: string;
  template: string;
  templateConfig: string;
  notes: string;
  finalizedAt: string | null;
  finalizedById: string | null;
  createdAt: string;
  updatedAt: string;
  chamberId: string | null;
}
export interface RxMedRow {
  id: string;
  prescriptionId: string;
  sortOrder: number;
  medicineId: number | null;
  brandName: string;
  generic: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  dose: string;
  route: string;
  frequency: string;
  mealTiming: string;
  duration: string;
  specialInstruction: string;
  customText: string;
}
export interface TemplateRow {
  id: string;
  doctorId: string;
  name: string;
  templateKey: string;
  config: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ChamberRow {
  id: string;
  doctorId: string;
  name: string;
  address: string;
  days: string;
  time: string;
  phone: string;
  serialInfo: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface LibraryRow {
  id: string;
  category: string;
  subcategory: string;
  labelEn: string;
  labelBn: string;
  code: string;
  keywords: string;
  isCustom: boolean;
  createdById: string | null;
  usageCount: number;
  createdAt: string;
}
export interface AuditRow {
  id: string;
  userId: string | null;
  userEmail: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface FileRow {
  id: string;
  /** Drive file id (Google build) or blob id (local build) */
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
  kind: string;
  relatedType: string;
  relatedId: string;
  folderPath: string;
  ownerUserId: string;
  ownerEmail: string;
  createdAt: string;
  deleted: boolean;
}
export interface FileBlobRow {
  id: string;
  dataBase64: string;
}

export interface Tables {
  users: UserRow[];
  sessions: SessionRow[];
  doctors: DoctorRow[];
  patients: PatientRow[];
  prescriptions: RxRow[];
  prescriptionMedicines: RxMedRow[];
  templates: TemplateRow[];
  chambers: ChamberRow[];
  libraryItems: LibraryRow[];
  auditLogs: AuditRow[];
  files: FileRow[];
  fileBlobs: FileBlobRow[];
}
export type TableName = keyof Tables;

const TABLE_NAMES: TableName[] = [
  "users",
  "sessions",
  "doctors",
  "patients",
  "prescriptions",
  "prescriptionMedicines",
  "templates",
  "chambers",
  "libraryItems",
  "auditLogs",
  "files",
  "fileBlobs",
];

const SEED_VERSION = 1;
const AUDIT_LOG_CAP = 2000;

function emptyTables(): Tables {
  return {
    users: [],
    sessions: [],
    doctors: [],
    patients: [],
    prescriptions: [],
    prescriptionMedicines: [],
    templates: [],
    chambers: [],
    libraryItems: [],
    auditLogs: [],
    files: [],
    fileBlobs: [],
  };
}

// ----- singleton state -----

export const tables: Tables = emptyTables();
let ready: Promise<void> | null = null;
const dirty = new Set<TableName>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let persistent = false;
let channel: BroadcastChannel | null = null;
const TAB_ID = Math.random().toString(36).slice(2);

export function isPersistent(): boolean {
  return persistent;
}

// ---------------------------------------------------------------------------
// Server mode (Google Apps Script build)
//
// There the tables are NOT preloaded: each one is read from its Google Sheet the
// first time a handler touches it (Apps Script I/O is synchronous), and the dirty
// ones are written back once at the end of the request.
// ---------------------------------------------------------------------------

export interface ServerPersistence {
  /** Read one table (sync). Tables without a sheet (sessions, blobs) return []. */
  loadTable(name: TableName): unknown[];
  /** Persist the given tables, diffing against what was loaded. */
  saveTables(names: TableName[]): void;
  /** Append-only audit trail (never loaded wholesale). */
  appendAudit(rows: AuditRow[]): void;
  readAudit(limit: number): AuditRow[];
}

let server: ServerPersistence | null = null;
let pendingAudit: AuditRow[] = [];

export function isServerMode(): boolean {
  return server !== null;
}

export function installServerMode(p: ServerPersistence) {
  server = p;
  persistent = false;
  for (const name of TABLE_NAMES) {
    let loaded = false;
    let value: unknown[] = [];
    Object.defineProperty(tables, name, {
      configurable: true,
      enumerable: true,
      get() {
        if (!loaded) {
          value = name === "auditLogs" ? [] : p.loadTable(name);
          loaded = true;
        }
        return value;
      },
      set(v: unknown[]) {
        value = v;
        loaded = true;
      },
    });
  }
  // allow a fresh request to start from a clean state (module state survives
  // only within one execution in Apps Script, but tests reuse the bundle)
  resetServerRequest = () => {
    for (const name of TABLE_NAMES) Reflect.deleteProperty(tables, name);
    installServerMode(p);
  };
}

let resetServerRequest: (() => void) | null = null;

/** Forget everything loaded during the previous request (server mode). */
export function beginServerRequest() {
  dirty.clear();
  pendingAudit = [];
  resetServerRequest?.();
}

/** Write the request's changes back to Google Sheets (server mode). */
export function endServerRequest() {
  if (!server) return;
  const names = [...dirty].filter((n) => n !== "auditLogs");
  dirty.clear();
  if (names.length) server.saveTables(names);
  if (pendingAudit.length) server.appendAudit(pendingAudit);
  pendingAudit = [];
}

export function queueAudit(row: AuditRow) {
  pendingAudit.push(row);
}

export function readAuditTail(limit: number): AuditRow[] | null {
  if (!server) return null;
  const persisted = server.readAudit(limit);
  return [...persisted, ...pendingAudit].slice(-limit);
}

/** Call after mutating a table in place so it gets written through to IndexedDB. */
export function touch(...names: TableName[]) {
  for (const n of names) dirty.add(n);
  if (server) return; // flushed once, at the end of the request
  if (n_pending()) return;
  flushTimer = setTimeout(() => void flush(), 120);
}

function n_pending() {
  return flushTimer !== null;
}

export async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!dirty.size) return;
  const names = [...dirty];
  dirty.clear();
  if (tables.auditLogs.length > AUDIT_LOG_CAP) {
    tables.auditLogs.splice(0, tables.auditLogs.length - AUDIT_LOG_CAP);
  }
  if (!persistent) return;
  const payload: Record<string, unknown> = {};
  for (const n of names) payload[n] = tables[n];
  await idbSetMany(payload);
  try {
    channel?.postMessage({ from: TAB_ID, tables: names });
  } catch {
    /* ignore */
  }
}

async function reloadTables(names: TableName[]) {
  const all = await idbGetAll();
  for (const n of names) {
    const rows = all[n];
    if (Array.isArray(rows)) (tables[n] as unknown[]) = rows as unknown[];
  }
}

/** Open IndexedDB, load every table, seed on first run. Safe to call repeatedly. */
export function ensureReady(): Promise<void> {
  if (!ready) ready = init();
  return ready;
}

async function init(): Promise<void> {
  persistent = await idbAvailable();
  const stored = persistent ? await idbGetAll() : {};
  const meta = stored.meta as { seedVersion?: number } | undefined;

  if (meta?.seedVersion === SEED_VERSION) {
    for (const n of TABLE_NAMES) {
      const rows = stored[n];
      (tables[n] as unknown[]) = Array.isArray(rows) ? (rows as unknown[]) : [];
    }
  } else {
    await seed();
    if (persistent) {
      const payload: Record<string, unknown> = { meta: { seedVersion: SEED_VERSION } };
      for (const n of TABLE_NAMES) payload[n] = tables[n];
      await idbSetMany(payload);
    }
  }

  if (persistent && typeof BroadcastChannel !== "undefined") {
    try {
      channel?.close();
      channel = new BroadcastChannel("smart-rx-sync");
      (channel as unknown as { unref?: () => void }).unref?.(); // don't keep Node (tests) alive
      channel.onmessage = (ev: MessageEvent) => {
        const d = ev.data as { from: string; tables: TableName[] } | undefined;
        if (d && d.from !== TAB_ID && Array.isArray(d.tables)) void reloadTables(d.tables);
      };
    } catch {
      channel = null;
    }
  }
  if (typeof window !== "undefined") {
    const flushNow = () => void flush();
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushNow();
    });
  }
}

// ----- first-run seeding (users, doctor, chambers, sample data, libraries) -----

interface SeedFile {
  users: Omit<UserRow, "passwordHash">[];
  doctors: DoctorRow[];
  chambers: ChamberRow[];
  templates: TemplateRow[];
  patients: PatientRow[];
  prescriptions: RxRow[];
  prescriptionMedicines: RxMedRow[];
  defaultPasswords: Record<string, string>;
}
interface LibraryFile {
  cols: string[];
  rows: (string | number)[][];
}

async function seed(): Promise<void> {
  const ds = dataSource();
  const [seedFile, libFile] = await Promise.all([
    ds.json<SeedFile>("seed.json"),
    ds.json<LibraryFile>("libraries.json"),
  ]);

  const fresh = emptyTables();
  fresh.users = await Promise.all(
    seedFile.users.map(async (u) => ({
      ...u,
      passwordHash: await hashPassword(seedFile.defaultPasswords[u.email] ?? "changeme123"),
    }))
  );
  fresh.doctors = seedFile.doctors;
  fresh.chambers = seedFile.chambers;
  fresh.templates = seedFile.templates;
  fresh.patients = seedFile.patients;
  fresh.prescriptions = seedFile.prescriptions;
  fresh.prescriptionMedicines = seedFile.prescriptionMedicines;

  const now = new Date().toISOString();
  const idx = (c: string) => libFile.cols.indexOf(c);
  const [iId, iCat, iSub, iEn, iBn, iCode, iKw, iUse] = [
    "id",
    "category",
    "subcategory",
    "labelEn",
    "labelBn",
    "code",
    "keywords",
    "usageCount",
  ].map(idx);
  fresh.libraryItems = libFile.rows.map((r) => ({
    id: String(r[iId]),
    category: String(r[iCat]),
    subcategory: String(r[iSub] ?? ""),
    labelEn: String(r[iEn]),
    labelBn: String(r[iBn] ?? ""),
    code: String(r[iCode] ?? ""),
    keywords: String(r[iKw] ?? ""),
    isCustom: false,
    createdById: null,
    usageCount: Number(r[iUse] ?? 0),
    createdAt: now,
  }));

  for (const n of TABLE_NAMES) (tables[n] as unknown[]) = fresh[n] as unknown[];
}

/** Wipe everything and start from the bundled demo data again. */
export async function resetAll(): Promise<void> {
  await idbClear();
  for (const n of TABLE_NAMES) (tables[n] as unknown[]) = [];
  ready = null;
  await ensureReady();
}

/** Test helper: reset module state without touching IndexedDB. */
export function __resetForTests() {
  for (const n of TABLE_NAMES) (tables[n] as unknown[]) = [];
  ready = null;
  dirty.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  channel?.close();
  channel = null;
}
