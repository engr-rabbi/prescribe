// Transport for the Google build: the browser talks to the Apps Script web app
// (which owns the Google Sheets / Drive credentials). Nothing secret is ever in this file —
// only the public /exec URL, set at build time via NEXT_PUBLIC_API_URL.
//
// To keep the UI snappy despite ~0.5–1.5 s per Apps Script call:
//  • libraries (complaints, diagnoses, …) and the medicine catalogue are downloaded once
//    and searched locally (keystroke-speed typeahead),
//  • a few cheap GETs are cached for 30 s and dropped on any write,
//  • transient failures are retried.

import type { LibraryRow } from "@/lib/local-backend/store";
import { queryLibrary } from "@/lib/local-backend/handlers";
import {
  dosageForms,
  recordsFromColumns,
  searchMedicines,
  setCatalogueProvider,
  validateCatalogue,
} from "@/lib/local-backend/medicines";
import { parseUrl } from "@/lib/local-backend/router";
import { idbGet, idbSetMany } from "@/lib/local-backend/idb";
import { LIBRARY_CATEGORIES } from "@/lib/local-backend/schemas";
import type { LibraryItemDTO } from "@/lib/types";

export const API_URL: string = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
export const isRemote = API_URL.length > 0;

const TOKEN_KEY = "rx_remote_token";
let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}
function setToken(t: string | null) {
  memoryToken = t;
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = /Lock timeout|too many times|temporarily|Service invoked|try again/i;

async function call<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  let env: Envelope<T>;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      // text/plain keeps this a "simple" CORS request — Apps Script can't answer pre-flights
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: getToken(), method, path, body }),
      redirect: "follow",
    });
    const text = await res.text();
    try {
      env = JSON.parse(text) as Envelope<T>;
    } catch {
      throw new Error("The Google backend returned an unexpected response (check the deployment URL and access setting)");
    }
  } catch (e) {
    if (attempt < 2 && method === "GET") {
      await sleep(600 * (attempt + 1));
      return call<T>(method, path, body, attempt + 1);
    }
    throw e instanceof Error && e.message.startsWith("The Google")
      ? e
      : new Error("Cannot reach the Google backend — check your internet connection");
  }
  if (!env.ok) {
    if (attempt < 2 && TRANSIENT.test(env.error ?? "")) {
      await sleep(800 * (attempt + 1));
      return call<T>(method, path, body, attempt + 1);
    }
    if (env.status === 401 && path !== "/api/auth/login") setToken(null);
    throw new Error(env.error || "Request failed");
  }
  return env.data as T;
}

// ----- tiny GET cache -----

const TTL_MS = 30_000;
const CACHEABLE = new Set(["/api/doctor/profile", "/api/doctor/chambers", "/api/templates"]);
const cache = new Map<string, { at: number; data: unknown }>();

// ----- local mirrors of reference data -----

let libraryMirror: Promise<LibraryRow[]> | null = null;

function loadLibraryMirror(): Promise<LibraryRow[]> {
  if (!libraryMirror) {
    libraryMirror = call<{ items: LibraryItemDTO[] }>("GET", "/api/libraries/all")
      .then(({ items }) =>
        items.map(
          (i): LibraryRow => ({ ...i, keywords: "", createdById: null, createdAt: "" })
        )
      )
      .catch((e) => {
        libraryMirror = null;
        throw e;
      });
  }
  return libraryMirror;
}

const CATALOGUE_KEY = "remote:catalogue";
let catalogueInstalled = false;

function installCatalogue() {
  if (catalogueInstalled) return;
  catalogueInstalled = true;
  setCatalogueProvider({
    async load() {
      const { version } = await call<{ version: string }>("GET", "/api/medicines/version");
      const cached = (await idbGet(CATALOGUE_KEY)) as
        | { version: string; data: { cols: string[]; rows: (string | number)[][] } }
        | undefined;
      let data = cached && cached.version === version ? cached.data : null;
      if (!data) {
        const fresh = await call<{ cols: string[]; rows: (string | number)[][]; version: string }>(
          "GET",
          "/api/medicines/catalogue"
        );
        data = { cols: fresh.cols, rows: fresh.rows };
        void idbSetMany({ [CATALOGUE_KEY]: { version: fresh.version, data } });
      }
      return validateCatalogue(recordsFromColumns(data));
    },
  });
}

/** Start downloading reference data in the background after login. */
export function prefetchReferenceData() {
  if (!isRemote) return;
  installCatalogue();
  void loadLibraryMirror().catch(() => undefined);
  void import("@/lib/local-backend/medicines").then((m) => m.prefetchCatalogue());
}

// ----- the single entry point used by api-client -----

export async function remoteRequest<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const { pathname, query } = parseUrl(url);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;

  // reads served from the local mirrors
  if (method === "GET" && pathname === "/api/libraries") {
    const category = query.get("category") ?? "";
    if (!(LIBRARY_CATEGORIES as readonly string[]).includes(category)) {
      throw new Error(`category must be one of: ${LIBRARY_CATEGORIES.join(" | ")}`);
    }
    const { items, subcategories } = queryLibrary(
      await loadLibraryMirror(),
      category,
      (query.get("q") ?? "").trim(),
      (query.get("subcategory") ?? "").trim()
    );
    return { items: items.map(({ keywords: _k, createdById: _c, createdAt: _t, ...dto }) => dto), subcategories } as T;
  }
  if (method === "GET" && pathname === "/api/medicines/search") {
    installCatalogue();
    const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 40));
    return (await searchMedicines((query.get("q") ?? "").trim(), (query.get("form") ?? "").trim(), limit)) as T;
  }
  if (method === "GET" && pathname === "/api/medicines/forms") {
    installCatalogue();
    return { forms: await dosageForms() } as T;
  }

  if (method === "GET" && pathname === "/api/auth/me" && !getToken()) return { user: null } as T;

  if (method === "GET" && CACHEABLE.has(pathname)) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
    const data = await call<T>("GET", url);
    cache.set(url, { at: Date.now(), data });
    return data;
  }

  if (method !== "GET") cache.clear();

  if (pathname === "/api/auth/logout") {
    try {
      await call("POST", url, body);
    } finally {
      setToken(null);
      cache.clear();
    }
    return { ok: true } as T;
  }

  const data = await call<T>(method, url, body);

  if (pathname === "/api/auth/login") {
    const t = (data as unknown as { token?: string }).token;
    if (t) setToken(t);
    prefetchReferenceData();
  }
  if (pathname === "/api/auth/me" && (data as { user: unknown }).user) prefetchReferenceData();
  if (method === "POST" && pathname === "/api/libraries") {
    const item = (data as { item: LibraryItemDTO }).item;
    void loadLibraryMirror().then((rows) => {
      if (!rows.some((r) => r.id === item.id)) rows.push({ ...item, keywords: "", createdById: null, createdAt: "" });
    });
  }
  if (method === "POST" && pathname === "/api/admin/medicines/import") {
    setCatalogueProvider(null);
    catalogueInstalled = false; // next search re-downloads the (re-imported) catalogue
  }
  return data;
}
