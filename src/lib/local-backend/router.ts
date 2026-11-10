// Minimal request router: turns `fetch("/api/…")`-style calls from the UI into
// handler invocations against the in-browser store. Throws Error(message) with
// the exact same messages the original HTTP API returned in its JSON bodies.

import { ZodError } from "zod";
import type { Query } from "./handlers";
import * as h from "./handlers";
import * as f from "./files";
import { HttpError } from "./core";
import { ensureReady, isServerMode } from "./store";

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/** Tiny URL splitter + query-string reader (no dependency on URL / URLSearchParams). */
export function parseUrl(url: string): { pathname: string; query: Query } {
  const hash = url.indexOf("#");
  const clean = hash >= 0 ? url.slice(0, hash) : url;
  const q = clean.indexOf("?");
  const pathname = q >= 0 ? clean.slice(0, q) : clean;
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const pair of clean.slice(q + 1).split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = decode(eq >= 0 ? pair.slice(0, eq) : pair);
      if (!(k in params)) params[k] = eq >= 0 ? decode(pair.slice(eq + 1)) : "";
    }
  }
  return {
    pathname,
    query: {
      get: (k: string) => (k in params ? params[k] : null),
      has: (k: string) => k in params,
    },
  };
}

type Method = "GET" | "POST" | "PUT" | "DELETE";
interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handler: h.Handler;
}

const routes: Route[] = [];

function add(method: Method, path: string, handler: h.Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:([a-zA-Z]+)/g, (_m, k: string) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "/?$"
  );
  routes.push({ method, pattern, keys, handler });
}

// auth
add("POST", "/api/auth/login", h.login);
add("POST", "/api/auth/logout", h.logout);
add("GET", "/api/auth/me", h.me);
add("POST", "/api/auth/change-password", h.changePassword);
// dashboard
add("GET", "/api/dashboard", h.dashboard);
// doctor
add("GET", "/api/doctor/profile", h.getProfile);
add("PUT", "/api/doctor/profile", h.updateProfile);
add("GET", "/api/doctor/chambers", h.listChambers);
add("POST", "/api/doctor/chambers", h.createChamber);
add("PUT", "/api/doctor/chambers/:id", h.updateChamber);
add("DELETE", "/api/doctor/chambers/:id", h.deleteChamber);
// templates
add("GET", "/api/templates", h.listTemplates);
add("POST", "/api/templates", h.saveTemplate);
add("DELETE", "/api/templates", h.deleteTemplate);
// patients
add("GET", "/api/patients", h.listPatients);
add("POST", "/api/patients", h.createPatient);
add("GET", "/api/patients/:id", h.getPatient);
add("PUT", "/api/patients/:id", h.updatePatient);
add("GET", "/api/patients/:id/consultations", h.patientConsultations);
// prescriptions
add("GET", "/api/prescriptions", h.listPrescriptions);
add("POST", "/api/prescriptions", h.upsertPrescription);
add("GET", "/api/prescriptions/:id", h.getPrescription);
add("PUT", "/api/prescriptions/:id", h.updatePrescription);
add("DELETE", "/api/prescriptions/:id", h.deletePrescription);
add("POST", "/api/prescriptions/:id/finalize", h.finalizePrescription);
add("POST", "/api/prescriptions/:id/revise", h.revisePrescription);
add("POST", "/api/prescriptions/:id/duplicate", h.duplicatePrescription);
// medicines & libraries
add("GET", "/api/medicines/search", h.searchMedicinesHandler);
add("GET", "/api/medicines/forms", h.medicineForms);
add("GET", "/api/libraries", h.listLibrary);
add("POST", "/api/libraries", h.addLibraryItem);
add("GET", "/api/libraries/all", h.libraryAll);
add("GET", "/api/medicines/catalogue", h.medicineCatalogue);
add("GET", "/api/medicines/version", h.medicineVersion);
// files (Google Drive in the Google build)
add("POST", "/api/files", f.uploadFile);
add("GET", "/api/files", f.listFiles);
add("GET", "/api/files/:id/content", f.fileContent);
add("DELETE", "/api/files/:id", f.deleteFile);
add("GET", "/api/admin/files", f.listSystemFiles);
add("POST", "/api/admin/exports", f.createExport);
add("POST", "/api/admin/backups", f.runBackup);
// admin
add("GET", "/api/admin/users", h.listUsers);
add("POST", "/api/admin/users", h.createUser);
add("PUT", "/api/admin/users/:id", h.updateUser);
add("GET", "/api/admin/audit-logs", h.auditLogs);
add("GET", "/api/admin/medicines", h.medicineStats);
add("POST", "/api/admin/medicines/import", h.importMedicines);

/** Dispatch one API call. Resolves with the JSON body or rejects with Error(message). */
export async function handleRequest<T>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  if (!isServerMode()) await ensureReady();
  const method = (init?.method ?? "GET").toUpperCase() as Method;
  const parsed = parseUrl(url);

  let body: unknown = null;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = null;
    }
  } else if (init?.body !== undefined) {
    body = init.body;
  }

  try {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(parsed.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return (await r.handler({ params, query: parsed.query, body })) as T;
    }
    throw new HttpError(404, `Not found: ${method} ${parsed.pathname}`);
  } catch (error) {
    if (error instanceof HttpError) {
      const e = new Error(error.message) as Error & { status?: number };
      e.status = error.status; // the Google web-app wrapper turns this into the HTTP-like status in its JSON reply
      throw e;
    }
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      { const e = new Error(`${issue?.path.join(".") || "body"}: ${issue?.message ?? "Invalid request"}`) as Error & { status?: number }; e.status = 400; throw e; }
    }
    console.error(`[local-backend] ${method} ${parsed.pathname}`, error);
    throw new Error("Internal server error");
  }
}
