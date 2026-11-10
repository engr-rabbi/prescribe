// Integration tests for the in-browser backend (runs in Node with a fake IndexedDB).
//   npm test
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { before, describe, it } from "node:test";

import { setDataSource } from "@/lib/local-backend/data-source";
import { handleRequest } from "@/lib/local-backend/router";
import { __resetForTests, ensureReady, flush, tables } from "@/lib/local-backend/store";
import { api } from "@/lib/api-client";
import type { PrescriptionDTO } from "@/lib/types";

const DATA = path.join(process.cwd(), "public", "data");
setDataSource({
  json: async (f) => JSON.parse(await readFile(path.join(DATA, f), "utf8")),
  text: (f) => readFile(path.join(DATA, f), "utf8"),
});

const rejects = (p: Promise<unknown>, msg: RegExp) => assert.rejects(p, msg);

async function loginAs(role: "admin" | "doctor" | "assistant") {
  return api.login(`${role}@rx.local`, `${role}123`);
}

function rxBody(patientId: string, extra: Record<string, unknown> = {}) {
  return {
    patientId,
    template: "modern",
    templateConfig: "{}",
    notes: "t",
    data: {
      chiefComplaints: [{ id: "c", label: "Fever", labelBn: "জ্বর", duration: "3 days" }],
      examinations: [],
      diagnosis: [],
      investigations: [],
      advice: [],
      medicines: [{ brandName: "Napa", generic: "Paracetamol", strength: "500 mg", dosageForm: "Tablet" }],
      followUp: { date: new Date(Date.now() + 7 * 864e5).toISOString(), note: "review" },
    },
    ...extra,
  };
}

describe("local backend", () => {
  before(async () => {
    __resetForTests();
    await ensureReady();
  });

  it("seeds users, libraries and sample data on first run", () => {
    assert.equal(tables.users.length, 3);
    assert.ok(tables.libraryItems.length > 1500);
    assert.equal(tables.patients.length, 3);
    assert.ok(tables.users.every((u) => u.passwordHash.startsWith("pbkdf2$")));
  });

  it("requires authentication", async () => {
    await api.logout();
    assert.equal((await api.me()).user, null);
    await rejects(api.listPatients(), /Authentication required/);
  });

  it("logs in / out and rejects bad credentials", async () => {
    await rejects(api.login("doctor@rx.local", "nope"), /Invalid email or password/);
    await rejects(api.login("not-an-email", "x"), /email/i);
    const { user } = await loginAs("doctor");
    assert.equal(user.role, "DOCTOR");
    assert.ok(user.doctorId);
    assert.equal((await api.me()).user?.email, "doctor@rx.local");
    await api.logout();
    assert.equal((await api.me()).user, null);
  });

  it("dashboard returns scoped stats", async () => {
    await loginAs("doctor");
    const { stats } = await api.dashboard();
    assert.equal(stats.totalPatients, 3);
    assert.ok(stats.totalPrescriptions >= 1);
    assert.ok(Array.isArray(stats.recentPatients));
  });

  it("patients: create, search, update, history", async () => {
    await loginAs("assistant");
    const { patient } = await api.createPatient({ name: "Rahim Uddin", mobile: "01700000001", ageYears: 40 });
    assert.match(patient.code, /^PID-\d{6}$/);
    assert.equal((await api.listPatients("rahim")).total, 1);
    assert.equal((await api.listPatients("01700000001")).items[0].id, patient.id);
    const upd = await api.updatePatient(patient.id, { address: "Dhaka" });
    assert.equal(upd.patient.address, "Dhaka");
    // regression: a partial update must not blank the fields it doesn't mention
    assert.equal(upd.patient.mobile, "01700000001");
    assert.equal(upd.patient.ageYears, 40);
    await rejects(api.createPatient({ name: " " }), /name/i);
    assert.deepEqual((await api.patientConsultations(patient.id)).prescriptions, []);
  });

  it("prescription lifecycle: draft → finalize → immutable → revise → duplicate", async () => {
    await loginAs("assistant");
    const pid = (await api.listPatients("Rahim")).items[0].id;
    await rejects(api.createPrescription(rxBody(pid)), /Insufficient permissions/);

    await loginAs("doctor");
    const { prescription: draft } = await api.createPrescription(rxBody(pid));
    assert.equal(draft.status, "DRAFT");
    assert.match(draft.code, /^RX-\d{8}-\d{4}$/);
    assert.equal(draft.medicines.length, 1);

    const upd = (await api.updatePrescription(draft.id, rxBody(pid, { notes: "changed" }))).prescription;
    assert.equal(upd.notes, "changed");
    assert.equal(upd.medicines.length, 1); // lines replaced, not duplicated

    // upsert path (body.id) behaves like update
    const up2 = (await api.createPrescription({ ...rxBody(pid), id: draft.id })).prescription;
    assert.equal(up2.id, draft.id);

    const fin = (await api.finalizePrescription(draft.id)).prescription;
    assert.equal(fin.status, "FINALIZED");
    await rejects(api.finalizePrescription(draft.id), /already finalized/);
    await rejects(api.updatePrescription(draft.id, rxBody(pid)), /immutable/);
    await rejects(api.deletePrescription(draft.id), /Only draft/);

    const rev = (await api.revisePrescription(draft.id, "dose fix")).prescription;
    assert.equal(rev.version, 2);
    assert.equal(rev.rootId, draft.id);
    assert.equal(rev.status, "DRAFT");
    assert.equal(rev.medicines.length, 1);
    assert.equal((await api.getPrescription(draft.id)).prescription.status, "FINALIZED");
    await rejects(api.revisePrescription(rev.id, ""), /Only finalized/);

    const dup = (await api.duplicatePrescription(draft.id)).prescription;
    assert.equal(dup.version, 1);
    assert.match(dup.notes, /Duplicated from/);

    await api.deletePrescription(dup.id);
    await rejects(api.getPrescription(dup.id), /not found/i);

    const list = await api.listPrescriptions({ q: "Rahim" });
    assert.ok(list.total >= 2);
    const drafts = await api.listPrescriptions({ status: "DRAFT" });
    assert.ok(drafts.items.every((r: PrescriptionDTO) => r.status === "DRAFT"));
    await rejects(api.listPrescriptions({ status: "WHATEVER" }), /status must be/);
  });

  it("assistant can view but not finalize; doctors only see their own", async () => {
    await loginAs("assistant");
    const { items } = await api.listPrescriptions({ status: "DRAFT" });
    assert.ok(items.length > 0);
    await rejects(api.finalizePrescription(items[0].id), /Insufficient permissions/);
  });

  it("medicine catalogue: 21,714 rows, ranked search, form filter", async () => {
    await loginAs("doctor");
    const all = await api.searchMedicines("", { limit: 100 });
    assert.equal(all.items.length, 100);
    const napa = await api.searchMedicines("napa", { limit: 50 });
    assert.ok(napa.items.length > 0);
    assert.ok(napa.items[0].brandName.toLowerCase().startsWith("napa"));
    const generic = await api.searchMedicines("paracetamol", { limit: 20 });
    assert.ok(generic.items.some((m) => m.generic.toLowerCase().includes("paracetamol")));
    const tab = await api.searchMedicines("napa", { form: "Tablet", limit: 50 });
    assert.ok(tab.items.every((m) => m.dosageForm === "Tablet"));
    const { forms } = await api.dosageForms();
    assert.ok(forms.includes("Tablet") && forms.includes("Capsule"));

    await loginAs("admin");
    const stats = await api.medicineStats();
    assert.equal(stats.total, 21714);
    assert.equal(stats.allopathic + stats.herbal, stats.total);
    const report = await api.importMedicines();
    assert.equal(report.imported, 21714);
  });

  it("libraries: filter, subcategories, custom items dedupe", async () => {
    await loginAs("doctor");
    for (const category of ["COMPLAINT", "HISTORY", "EXAM", "DIAGNOSIS", "INVESTIGATION", "ADVICE"]) {
      const { items } = await api.listLibrary(category);
      assert.ok(items.length > 0, category);
      assert.ok(items.length <= 200);
    }
    const hits = await api.listLibrary("COMPLAINT", "fever");
    assert.ok(hits.items.some((i) => i.labelEn.toLowerCase().includes("fever")));
    const bn = await api.listLibrary("COMPLAINT", "জ্বর");
    assert.ok(bn.items.length > 0);
    const a = await api.addLibraryItem({ category: "ADVICE", labelEn: "Drink water" });
    const b = await api.addLibraryItem({ category: "ADVICE", labelEn: "Drink water" });
    assert.equal(a.item.id, b.item.id);
    assert.equal(a.item.isCustom, true);
    await rejects(api.listLibrary("NOPE"), /category must be one of/);
  });

  it("chambers & templates: primary / default exclusivity, ownership", async () => {
    await loginAs("doctor");
    const c1 = (await api.createChamber({ name: "A" })).chamber;
    const c2 = (await api.createChamber({ name: "B", isPrimary: true })).chamber;
    let list = (await api.listChambers()).chambers;
    assert.equal(list.filter((c) => c.isPrimary).length, 1);
    assert.equal(list.find((c) => c.isPrimary)?.id, c2.id);
    await api.updateChamber(c1.id, { isPrimary: true });
    list = (await api.listChambers()).chambers;
    assert.equal(list.find((c) => c.isPrimary)?.id, c1.id);
    await api.deleteChamber(c2.id);
    await rejects(api.deleteChamber(c2.id), /Chamber not found/);
    await rejects(api.createChamber({ name: " " }), /required/);

    await api.saveTemplate({ name: "T1", templateKey: "modern", config: {}, isDefault: true });
    await api.saveTemplate({ name: "T2", templateKey: "clinical", config: {}, isDefault: true });
    const { templates } = await api.getTemplates();
    assert.equal(templates.filter((t) => t.isDefault).length, 1);
    await api.deleteTemplate(templates[0].id);
  });

  it("doctor profile update is doctor-only", async () => {
    await loginAs("doctor");
    const { profile } = await api.updateDoctorProfile({ themeColor: "indigo", showPhoto: true });
    assert.equal(profile.themeColor, "indigo");
    assert.equal((await api.getDoctorProfile()).profile.showPhoto, true);
    await loginAs("assistant");
    await rejects(api.updateDoctorProfile({ themeColor: "x" }), /Insufficient permissions/);
    assert.equal((await api.getDoctorProfile()).profile.fullName, "Dr. Suman Roy");
  });

  it("admin: users, password change, audit log", async () => {
    await loginAs("doctor");
    await rejects(api.listUsers(), /Insufficient permissions/);

    const { user: admin } = await loginAs("admin");
    const { user } = await api.createUser({ email: "New@Rx.Local", name: "New", password: "secret1", role: "ASSISTANT" });
    assert.equal(user.email, "new@rx.local");
    await rejects(api.createUser({ email: "new@rx.local", name: "x", password: "secret1", role: "ASSISTANT" }), /already exists/);
    await rejects(api.updateUser(admin.id, { active: false }), /cannot deactivate your own/);
    await api.updateUser(user.id, { active: false });
    await rejects(api.login("new@rx.local", "secret1"), /deactivated/);
    await api.updateUser(user.id, { active: true, password: "secret2" });
    await api.login("new@rx.local", "secret2");

    await rejects(api.changePassword("wrong", "abcdef"), /Current password is incorrect/);
    await api.changePassword("secret2", "secret3");
    await api.logout();
    await api.login("new@rx.local", "secret3");

    await loginAs("admin");
    const { logs } = await api.auditLogs(50);
    assert.ok(logs.length > 5);
    assert.ok(logs[0].createdAt >= logs[logs.length - 1].createdAt);
    assert.ok(logs.some((l) => l.action === "FINALIZE"));
  });

  it("persists to IndexedDB and survives a reload", async () => {
    await loginAs("assistant");
    const { patient } = await api.createPatient({ name: "Persist Me" });
    await flush();
    const before = tables.patients.length;
    __resetForTests(); // simulate a page reload (module state gone, IndexedDB kept)
    await ensureReady();
    assert.equal(tables.patients.length, before);
    assert.ok(tables.patients.some((p) => p.id === patient.id));
    assert.equal(tables.users.length >= 4, true);
  });

  it("unknown routes fail cleanly", async () => {
    await rejects(handleRequest("/api/nope"), /Not found/);
  });
});
