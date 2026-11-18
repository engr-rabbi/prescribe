// One-shot, idempotent data migration for databases created before multi-doctor accounts existed
// (local IndexedDB and the Google Sheets). It only fills in what is missing; running it twice is a no-op.

import { DEFAULT_ASSISTANT_PERMISSIONS } from "@/lib/permissions";
import { newId } from "./crypto";
import { firstDoctor, generateDoctorCode, uniqueUsername } from "./core";
import { tables, type TableName } from "./store";

export function migrateData(): Set<TableName> {
  const touched = new Set<TableName>();
  const mark = (t: TableName) => void touched.add(t);
  const now = new Date().toISOString();

  // ---- users ----
  for (const u of tables.users) {
    const before = JSON.stringify(u);
    if (!u.username) u.username = uniqueUsername((u.email || u.name || "user").split("@")[0]);
    if (!u.status) u.status = u.active === false ? "DEACTIVATED" : "ACTIVE";
    u.active = u.status === "ACTIVE";
    u.mustChangePassword = !!u.mustChangePassword;
    u.tempPasswordUsed = !!u.tempPasswordUsed;
    u.tempPasswordExpiresAt = u.tempPasswordExpiresAt ?? null;
    u.phone = u.phone ?? "";
    u.googleSub = u.googleSub ?? null;
    u.patientUid = u.patientUid ?? null;
    u.lastLoginAt = u.lastLoginAt ?? null;
    u.doctorId = u.doctorId ?? null;
    if (u.role === "ASSISTANT" && !u.doctorId) u.doctorId = firstDoctor()?.id ?? null;
    if (JSON.stringify(u) !== before) mark("users");
  }

  // ---- doctors: unique doctor code ----
  for (const d of [...tables.doctors].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!d.code) {
      d.code = generateDoctorCode();
      mark("doctors");
    }
  }

  // ---- assistants: profile row, relationship row, default permissions ----
  for (const u of tables.users.filter((x) => x.role === "ASSISTANT" && x.doctorId)) {
    let a = tables.assistants.find((x) => x.userId === u.id);
    if (!a) {
      a = { id: newId(), userId: u.id, doctorId: u.doctorId!, name: u.name, phone: u.phone, email: u.email, createdAt: now, updatedAt: now };
      tables.assistants.push(a);
      mark("assistants");
    }
    if (!tables.relationships.some((r) => r.userId === u.id && r.doctorId === u.doctorId)) {
      tables.relationships.push({ id: newId(), doctorId: u.doctorId!, assistantId: a.id, userId: u.id, status: "ACTIVE", createdById: "", createdAt: now, endedAt: null });
      mark("relationships");
    }
    if (!tables.userPermissions.some((p) => p.userId === u.id)) {
      for (const key of DEFAULT_ASSISTANT_PERMISSIONS) {
        tables.userPermissions.push({ id: newId(), userId: u.id, permission: key, allowed: true, updatedById: "", updatedAt: now });
      }
      mark("userPermissions");
    }
  }

  // ---- ownership: patient records belong to exactly one doctor ----
  const doctorOfUser = (userId: string | null | undefined): string | null => {
    const u = tables.users.find((x) => x.id === userId);
    if (!u) return null;
    if (u.role === "DOCTOR") return tables.doctors.find((d) => d.userId === u.id)?.id ?? null;
    if (u.role === "ASSISTANT") return u.doctorId;
    return null;
  };
  for (const p of tables.patients) {
    let changed = false;
    if (!p.doctorId) {
      p.doctorId =
        doctorOfUser(p.createdById) ??
        tables.prescriptions.find((r) => r.patientId === p.id)?.doctorId ??
        firstDoctor()?.id ??
        null;
      changed = true;
    }
    if (p.patientUid === undefined) {
      p.patientUid = null;
      changed = true;
    }
    if (changed) mark("patients");
  }

  // ---- custom library entries + files ----
  for (const i of tables.libraryItems) {
    if (i.doctorId === undefined || (i.isCustom && !i.doctorId)) {
      i.doctorId = i.isCustom ? doctorOfUser(i.createdById) ?? firstDoctor()?.id ?? null : null;
      mark("libraryItems");
    }
  }
  for (const f of tables.files) {
    if (f.doctorId === undefined || f.doctorId === null) {
      let owner: string | null = null;
      if (f.relatedType === "PATIENT") owner = tables.patients.find((p) => p.id === f.relatedId)?.doctorId ?? null;
      else if (f.relatedType === "PRESCRIPTION") owner = tables.prescriptions.find((r) => r.id === f.relatedId)?.doctorId ?? null;
      else if (f.relatedType === "DOCTOR") owner = f.relatedId;
      if (f.doctorId !== owner) {
        f.doctorId = owner;
        mark("files");
      }
    }
  }
  return touched;
}
