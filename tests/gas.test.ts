// End-to-end tests of the REAL bundled Apps Script code (apps-script/dist/Code.js) running
// against tests/gas-emulator.ts. This validates the logic (sheet layout, Drive folder
// structure, security rules, caching, locking). It does not talk to Google — see
// docs/GOOGLE-SETUP.md ("Verify against real Google") for the 10-minute live check.
import assert from "node:assert/strict";
import { createHash, pbkdf2Sync } from "node:crypto";
import path from "node:path";
import { before, describe, it } from "node:test";
import { GasHarness } from "./gas-emulator";
import { fromHex, pbkdf2Sha256, toHex, utf8 } from "../apps-script/src/sha256";

const root = process.cwd();
const ADMIN = { email: "boss@clinic.test", password: "Sup3r-Secret-Pass" };
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
).toString("base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");

let g: GasHarness;
const col = (rows: any[][], name: string) => rows[0].indexOf(name);
const asObj = (rows: any[][], i: number) => Object.fromEntries(rows[0].map((h: string, c: number) => [h, rows[i][c]]));
const allCells = () => {
  const out: string[] = [];
  for (const ss of g.emu.spreadsheets.values()) for (const sh of ss.sheets) for (const r of sh.grid) for (const v of r) if (v !== "") out.push(String(v));
  return out;
};
const folderPath = (id: string) => {
  const parts: string[] = [];
  let f = g.emu.folders.get(id);
  while (f && f.parent) {
    parts.unshift(f.name);
    f = g.emu.folders.get(f.parent);
  }
  return parts.join("/");
};

describe("Google Apps Script backend (emulated Google services)", () => {
  before(() => {
    g = new GasHarness(path.join(root, "apps-script/dist/Code.js"), path.join(root, "public/data"));
    g.prop("ADMIN_EMAIL", ADMIN.email);
    g.prop("ADMIN_PASSWORD", ADMIN.password);
    g.prop("SEED_BASE_URL", "https://seed.test/data");
  });

  it("pure-JS PBKDF2 equals Node/WebCrypto output", () => {
    const salt = fromHex("00112233445566778899aabbccddeeff");
    assert.equal(
      toHex(pbkdf2Sha256(utf8("pässwörd হ্যালো"), salt, 5000)),
      pbkdf2Sync("pässwörd হ্যালো", Buffer.from(salt), 5000, 32, "sha256").toString("hex")
    );
  });

  it("setup refuses to run without admin credentials", () => {
    const bare = new GasHarness(path.join(root, "apps-script/dist/Code.js"), path.join(root, "public/data"));
    assert.throws(() => bare.call("setup"), /ADMIN_EMAIL and ADMIN_PASSWORD/);
    bare.prop("ADMIN_EMAIL", "a@b.c");
    bare.prop("ADMIN_PASSWORD", "short");
    assert.throws(() => bare.call("setup"), /min\. 10 characters/);
  });

  it("setup builds the Drive tree, every worksheet, seed data, secrets and the backup trigger", () => {
    const log = g.call("setup");
    assert.match(log, /Setup complete/);

    // Drive folder structure
    const rootId = g.prop("ROOT_FOLDER_ID")!;
    const top = [...g.emu.folders.values()].filter((f) => f.parent === rootId).map((f) => f.name).sort();
    assert.deepEqual(top, [
      "Clinic Logos", "Doctor Profiles", "Doctor Signatures", "Exported Reports", "Investigation Reports",
      "Medical Images", "Patient Documents", "Patient Medical Reports", "Prescription PDFs", "System Backups",
    ]);
    // spreadsheet lives inside the root folder
    const ssFile = g.emu.files.get(g.prop("SPREADSHEET_ID")!);
    assert.equal(ssFile.parent, rootId);

    // worksheets
    const ss = g.emu.spreadsheets.get(g.prop("SPREADSHEET_ID")!);
    const names = ss.sheets.map((s: any) => s.name);
    for (const n of [
      "Users", "Roles", "Doctors", "Chambers", "Patients", "Prescriptions", "PrescriptionMedicines", "FollowUps",
      "PatientMedicalHistory", "Appointments", "Templates", "ChiefComplaints", "HistoryPresets", "ExamFindings",
      "Diagnoses", "Investigations", "Advice", "CustomEntries", "Medicines", "Files", "AuditLogs", "SystemSettings",
    ]) assert.ok(names.includes(n), `missing worksheet ${n}`);

    // seed
    assert.equal(g.sheet("Medicines").length - 1, 21714);
    assert.ok(g.sheet("ChiefComplaints").length > 100);
    assert.ok(g.sheet("Diagnoses").length > 100);
    assert.equal(g.sheet("Users").length, 2); // header + admin only (no demo accounts)
    assert.ok(g.sheet("Roles").length > 5);

    // secrets
    assert.ok(g.prop("SESSION_SECRET") && g.prop("SESSION_SECRET")!.length >= 64);
    assert.ok(g.prop("PASSWORD_PEPPER"));
    assert.equal(g.prop("ADMIN_PASSWORD"), null, "initial admin password must be deleted after setup");
    assert.deepEqual(g.emu.triggers.map((t) => t.fn), ["dailyBackup"]);
  });

  it("setup is idempotent (no duplicates on re-run)", () => {
    const before = [g.sheet("Users").length, g.sheet("Medicines").length, g.sheet("Roles").length];
    g.prop("ADMIN_PASSWORD", "Another-Pass-123");
    g.call("setup");
    assert.deepEqual([g.sheet("Users").length, g.sheet("Medicines").length, g.sheet("Roles").length], before);
    assert.equal(g.emu.triggers.length, 1);
    assert.equal([...g.emu.folders.values()].filter((f) => f.name === "Patient Documents").length, 1);
  });

  it("never stores a plain-text password; only salted, peppered PBKDF2 hashes", () => {
    const users = g.sheet("Users");
    const u = asObj(users, 1);
    assert.match(u.passwordHash, /^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    assert.ok(!allCells().some((c) => c.includes(ADMIN.password)));
    // the pepper matters: hashing without it must NOT reproduce the stored hash
    const [, iter, salt, hash] = u.passwordHash.split("$");
    const noPepper = pbkdf2Sync(ADMIN.password, Buffer.from(salt, "hex"), Number(iter), 32, "sha256").toString("hex");
    assert.notEqual(noPepper, hash);
    const withPepper = pbkdf2Sync(`${g.prop("PASSWORD_PEPPER")}:${ADMIN.password}`, Buffer.from(salt, "hex"), Number(iter), 32, "sha256").toString("hex");
    assert.equal(withPepper, hash);
  });

  it("authentication: tokens are required, signed, expiring, and revoked by password change", async () => {
    assert.equal((await g.req("GET", "/health")).ok, true);
    assert.equal((await g.req("GET", "/api/patients", undefined, null)).status, 401);
    assert.equal((await g.req("GET", "/api/patients", undefined, "garbage.token")).status, 401);
    assert.equal((await g.login(ADMIN.email, "wrong")).status, 401);

    const ok = await g.login(ADMIN.email, ADMIN.password);
    assert.equal(ok.ok, true);
    assert.equal(ok.data.user.role, "SUPER_ADMIN");
    const [body, sig] = g.token!.split(".");
    // tampering with the payload invalidates the signature
    const forged = Buffer.from(JSON.stringify({ u: "x", e: Date.now() + 1e9, v: "" })).toString("base64url");
    assert.equal((await g.req("GET", "/api/auth/me", undefined, `${forged}.${sig}`)).data.user, null);
    assert.equal((await g.req("GET", "/api/auth/me", undefined, `${body}.AAAA`)).data.user, null);

    // password change revokes tokens issued before
    const old = g.token!;
    const ch = await g.req("POST", "/api/auth/change-password", { currentPassword: ADMIN.password, newPassword: "Brand-New-Pass-9" });
    assert.equal(ch.ok, true);
    assert.equal((await g.req("GET", "/api/auth/me", undefined, old)).data.user, null);
    assert.equal((await g.login(ADMIN.email, "Brand-New-Pass-9")).ok, true);
    ADMIN.password = "Brand-New-Pass-9";
  });

  it("brute-force protection locks the account after repeated failures", async () => {
    for (let i = 0; i < 6; i++) await g.login("victim@clinic.test", "bad");
    const r = await g.login("victim@clinic.test", "bad");
    assert.equal(r.status, 429);
    g.emu.now += 16 * 60_000; // lock expires
    assert.equal((await g.login("victim@clinic.test", "bad")).status, 401);
  });

  let doctorToken = "", assistantToken = "";
  let patientId = "", patientCode = "", rxId = "";

  it("admin creates a doctor (profile row auto-created) and an assistant", async () => {
    await g.login(ADMIN.email, ADMIN.password);
    const d = await g.req("POST", "/api/admin/users", { email: "Dr.Rahman@Clinic.test", name: "Dr. Rahman", password: "Doctor-Pass-1", role: "DOCTOR" });
    assert.equal(d.ok, true, d.error);
    const a = await g.req("POST", "/api/admin/users", { email: "asst@clinic.test", name: "Assistant One", password: "Assist-Pass-1", role: "ASSISTANT" });
    assert.equal(a.ok, true, a.error);
    assert.equal((await g.req("POST", "/api/admin/users", { email: "asst@clinic.test", name: "x", password: "Assist-Pass-1", role: "ASSISTANT" })).status, 409);
    assert.equal(g.sheet("Doctors").length, 2);
    assert.equal(asObj(g.sheet("Users"), 2).email, "dr.rahman@clinic.test");
    assert.ok(!allCells().some((c) => c.includes("Doctor-Pass-1") || c.includes("Assist-Pass-1")));

    doctorToken = (await g.login("dr.rahman@clinic.test", "Doctor-Pass-1")).data.token;
    assistantToken = (await g.login("asst@clinic.test", "Assist-Pass-1")).data.token;
    assert.ok(doctorToken && assistantToken);
  });

  it("role separation: admin-only endpoints reject doctors and assistants", async () => {
    for (const t of [doctorToken, assistantToken]) {
      assert.equal((await g.req("GET", "/api/admin/users", undefined, t)).status, 403);
      assert.equal((await g.req("GET", "/api/admin/audit-logs", undefined, t)).status, 403);
      assert.equal((await g.req("POST", "/api/admin/backups", {}, t)).status, 403);
      assert.equal((await g.req("POST", "/api/admin/exports", { entity: "patients" }, t)).status, 403);
    }
  });

  it("patients: saved to Google Sheets with text fields intact (phone numbers, ISO dates)", async () => {
    const r = await g.req("POST", "/api/patients", { name: "Rahim Uddin", mobile: "01711112222", ageYears: 42, gender: "M", allergies: "Penicillin", medicalHistory: "HTN" }, assistantToken);
    assert.equal(r.ok, true, r.error);
    patientId = r.data.patient.id;
    patientCode = r.data.patient.code;
    const rows = g.sheet("Patients");
    const p = asObj(rows, rows.length - 1);
    assert.equal(p.id, patientId);
    assert.strictEqual(p.mobile, "01711112222"); // a string, leading zero preserved
    assert.equal(typeof p.createdAt, "string");
    assert.match(p.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(p.allergies, "Penicillin");
    // update + search round trip through Sheets
    const u = await g.req("PUT", `/api/patients/${patientId}`, { address: "Dhaka" }, assistantToken);
    assert.equal(u.data.patient.address, "Dhaka");
    assert.equal(asObj(g.sheet("Patients"), g.sheet("Patients").length - 1).address, "Dhaka");
    assert.equal((await g.req("GET", "/api/patients?q=01711", undefined, doctorToken)).data.total, 1);
  });

  it("prescription lifecycle persists to Prescriptions / PrescriptionMedicines / FollowUps / history views", async () => {
    const follow = new Date(Date.now() + 7 * 864e5).toISOString();
    const body = {
      patientId,
      template: "modern",
      data: {
        chiefComplaints: [{ id: "c1", label: "Fever", labelBn: "জ্বর", duration: "3 days" }],
        history: { presentIllness: "Fever for 3 days", allergyHistory: "Penicillin" },
        examinations: [], diagnosis: [{ id: "d1", label: "Viral fever" }], investigations: [], advice: [],
        medicines: [
          { brandName: "Napa", generic: "Paracetamol", strength: "500 mg", dosageForm: "Tablet", dose: "1", frequency: "1+1+1", duration: "5 days" },
          { brandName: "Seclo", generic: "Omeprazole", strength: "20 mg", dosageForm: "Capsule" },
        ],
        followUp: { date: follow, note: "Review with reports" },
      },
    };
    assert.equal((await g.req("POST", "/api/prescriptions", body, assistantToken)).status, 403);
    const c = await g.req("POST", "/api/prescriptions", body, doctorToken);
    assert.equal(c.ok, true, c.error);
    rxId = c.data.prescription.id;
    assert.equal(c.data.prescription.medicines.length, 2);

    const rx = g.sheet("Prescriptions");
    assert.equal(rx.length, 2);
    assert.equal(asObj(rx, 1).status, "DRAFT");
    assert.equal(g.sheet("PrescriptionMedicines").length, 3);
    assert.equal(asObj(g.sheet("PrescriptionMedicines"), 1).brandName, "Napa");
    assert.equal(g.sheet("FollowUps").length, 2);
    assert.equal(asObj(g.sheet("FollowUps"), 1).status, "DRAFT");
    assert.equal(asObj(g.sheet("PatientMedicalHistory"), 1).presentIllness, "Fever for 3 days");
    assert.equal(asObj(g.sheet("PatientMedicalHistory"), 1).patientCode, patientCode);

    // edit: medicine lines replaced (not duplicated), derived rows updated in place
    body.data.medicines = [body.data.medicines[0]];
    const up = await g.req("PUT", `/api/prescriptions/${rxId}`, body, doctorToken);
    assert.equal(up.ok, true, up.error);
    assert.equal(g.sheet("PrescriptionMedicines").length, 2);
    assert.equal(g.sheet("FollowUps").length, 2);

    // finalize / immutability / revise
    assert.equal((await g.req("POST", `/api/prescriptions/${rxId}/finalize`, {}, assistantToken)).status, 403);
    const f = await g.req("POST", `/api/prescriptions/${rxId}/finalize`, {}, doctorToken);
    assert.equal(f.data.prescription.status, "FINALIZED");
    assert.equal(asObj(g.sheet("Prescriptions"), 1).status, "FINALIZED");
    assert.equal(asObj(g.sheet("FollowUps"), 1).status, "SCHEDULED");
    assert.equal((await g.req("PUT", `/api/prescriptions/${rxId}`, body, doctorToken)).status, 409);
    const rev = await g.req("POST", `/api/prescriptions/${rxId}/revise`, { revisionNote: "dose" }, doctorToken);
    assert.equal(rev.data.prescription.version, 2);
    assert.equal(g.sheet("Prescriptions").length, 3);

    // delete a draft → rows disappear from every sheet
    const dup = await g.req("POST", `/api/prescriptions/${rxId}/duplicate`, {}, doctorToken);
    const before = g.sheet("Prescriptions").length;
    assert.equal((await g.req("DELETE", `/api/prescriptions/${dup.data.prescription.id}`, undefined, doctorToken)).ok, true);
    assert.equal(g.sheet("Prescriptions").length, before - 1);
    assert.ok(!g.sheet("FollowUps").some((r) => r[1] === dup.data.prescription.id));
    assert.ok(!g.sheet("PrescriptionMedicines").some((r) => r[1] === dup.data.prescription.id));
  });

  it("Drive: patient report → correct folder, registry row with Drive id / name / MIME / owner / related id", async () => {
    const up = await g.req("POST", "/api/files", { kind: "LAB_REPORT", relatedType: "PATIENT", relatedId: patientId, name: "CBC report.pdf", mimeType: "application/pdf", dataBase64: PDF }, assistantToken);
    assert.equal(up.ok, true, up.error);
    const f = up.data.file;
    assert.ok(f.driveFileId);

    const driveFile = g.emu.files.get(f.driveFileId);
    assert.ok(driveFile, "file exists in Drive");
    assert.equal(folderPath(driveFile.parent), `Smart Prescription System/Investigation Reports/${patientCode} - Rahim Uddin`.replace(/^[^/]+\//, "My Drive/Smart Prescription System/").replace(/^My Drive\//, ""));
    assert.equal(driveFile.mime, "application/pdf");
    assert.match(driveFile.name, /^\d{8}-\d{6}_LAB_REPORT_PID-\d+_CBC report\.pdf$/);
    assert.equal(driveFile.bytes.toString("base64"), PDF);
    assert.equal(driveFile.trashed, false);

    // registry row in Google Sheets holds ids/metadata but NEVER the bytes
    const rows = g.sheet("Files");
    const reg = asObj(rows, rows.length - 1);
    assert.equal(reg.storageKey, f.driveFileId);
    assert.equal(reg.mimeType, "application/pdf");
    assert.equal(reg.relatedType, "PATIENT");
    assert.equal(reg.relatedId, patientId);
    assert.equal(reg.ownerEmail, "asst@clinic.test");
    assert.ok(!allCells().some((c) => c.includes(PDF)), "binary data must not be in any sheet");
  });

  it("Drive: images, prescription PDF and the patient/doctor folder naming convention", async () => {
    const xr = await g.req("POST", "/api/files", { kind: "XRAY", relatedType: "PATIENT", relatedId: patientId, name: "chest.png", mimeType: "image/png", dataBase64: PNG }, assistantToken);
    assert.equal(folderPath(g.emu.files.get(xr.data.file.driveFileId).parent).endsWith(`Medical Images/${patientCode} - Rahim Uddin/X-ray`), true);
    const pdf = await g.req("POST", "/api/files", { kind: "PRESCRIPTION_PDF", relatedType: "PRESCRIPTION", relatedId: rxId, name: "RX-test_v1.pdf", mimeType: "application/pdf", dataBase64: PDF }, doctorToken);
    assert.equal(pdf.ok, true, pdf.error);
    const p = folderPath(g.emu.files.get(pdf.data.file.driveFileId).parent);
    assert.match(p, new RegExp(`Prescription PDFs/Dr\\. Rahman \\([0-9a-f]{8}\\)/${patientCode} - Rahim Uddin$`));
    assert.equal(g.emu.files.get(pdf.data.file.driveFileId).name, "RX-test_v1.pdf");
    // assistants cannot attach prescription PDFs
    assert.equal((await g.req("POST", "/api/files", { kind: "PRESCRIPTION_PDF", relatedType: "PRESCRIPTION", relatedId: rxId, name: "x.pdf", mimeType: "application/pdf", dataBase64: PDF }, assistantToken)).status, 403);
  });

  it("Drive: list, re-display / download, delete (trash) with permissions and validation", async () => {
    const list = await g.req("GET", `/api/files?relatedType=PATIENT&relatedId=${patientId}`, undefined, doctorToken);
    assert.equal(list.data.files.length, 2);
    const lab = list.data.files.find((f: any) => f.kind === "LAB_REPORT");
    const dl = await g.req("GET", `/api/files/${lab.id}/content`, undefined, doctorToken);
    assert.equal(dl.data.dataBase64, PDF);
    assert.equal(dl.data.file.mimeType, "application/pdf");

    assert.equal((await g.req("DELETE", `/api/files/${lab.id}`, undefined, assistantToken)).status, 403);
    assert.equal((await g.req("DELETE", `/api/files/${lab.id}`, undefined, doctorToken)).ok, true);
    assert.equal(g.emu.files.get(lab.driveFileId).trashed, true);
    assert.equal((await g.req("GET", `/api/files/${lab.id}/content`, undefined, doctorToken)).status, 404);
    assert.equal(asObj(g.sheet("Files"), 1 + g.sheet("Files").slice(1).findIndex((r) => r[0] === lab.id) + 0).deleted, true);

    // validation
    const bad = (extra: object) => g.req("POST", "/api/files", { kind: "MRI", relatedType: "PATIENT", relatedId: patientId, name: "a", mimeType: "image/png", dataBase64: PNG, ...extra }, assistantToken);
    assert.equal((await bad({ mimeType: "application/x-msdownload" })).status, 415);
    assert.equal((await bad({ kind: "BACKUP" })).status, 400);
    assert.equal((await bad({ relatedId: "nope" })).status, 404);
    assert.equal((await bad({ dataBase64: Buffer.alloc(9 * 1024 * 1024).toString("base64") })).status, 413);
    assert.equal((await g.req("GET", `/api/files?relatedType=PATIENT&relatedId=${patientId}`, undefined, null)).status, 401);
  });

  it("doctor profile images go to Drive; the sheet keeps only a reference; the UI still receives a data URL", async () => {
    const dataUrl = `data:image/png;base64,${PNG}`;
    const r = await g.req("PUT", "/api/doctor/profile", { fullName: "Dr. Rahman", photoUrl: dataUrl, signatureUrl: dataUrl, logoUrl: dataUrl }, doctorToken);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.data.profile.photoUrl, dataUrl);
    const docs = g.sheet("Doctors");
    const d = asObj(docs, 1);
    assert.match(d.photoUrl, /^file:/);
    assert.ok(!allCells().some((c) => c.includes(PNG)));
    const paths = ["Doctor Profiles", "Doctor Signatures", "Clinic Logos"].map((t) => [...g.emu.files.values()].some((f) => folderPath(f.parent).includes(`/${t}/`) || folderPath(f.parent).startsWith(`${t}/`)));
    assert.deepEqual(paths, [true, true, true]);
    // saving the form again unchanged does not create new Drive files
    const count = g.emu.stats.driveCreates;
    await g.req("PUT", "/api/doctor/profile", { fullName: "Dr. Rahman II", photoUrl: dataUrl }, doctorToken);
    assert.equal(g.emu.stats.driveCreates, count);
    // replacing the image trashes the old file
    const prev = [...g.emu.files.values()].find((f) => f.description.includes("DOCTOR_PHOTO") && !f.trashed);
    await g.req("PUT", "/api/doctor/profile", { photoUrl: `data:image/jpeg;base64,${PNG}` }, doctorToken);
    assert.equal(prev.trashed, true);
    assert.equal((await g.req("PUT", "/api/doctor/profile", { photoUrl: "data:text/html;base64,PGI+" }, doctorToken)).status, 415);
  });

  it("backup copies the whole spreadsheet into System Backups; CSV export lands in Exported Reports; retention prunes", async () => {
    await g.login(ADMIN.email, ADMIN.password);
    const b = await g.req("POST", "/api/admin/backups", {});
    assert.equal(b.ok, true, b.error);
    const copy = g.emu.files.get(b.data.file.driveFileId);
    assert.equal(folderPath(copy.parent).endsWith("System Backups"), true);
    assert.equal(g.emu.spreadsheets.get(copy.sheetId).sheets.length, 22);

    const ex = await g.req("POST", "/api/admin/exports", { entity: "patients" });
    assert.equal(ex.ok, true, ex.error);
    const csv = g.emu.files.get(ex.data.file.driveFileId);
    assert.equal(folderPath(csv.parent).endsWith("Exported Reports"), true);
    assert.match(csv.bytes.toString("utf8"), /Rahim Uddin/);
    assert.equal((await g.req("POST", "/api/admin/exports", { entity: "nope" })).status, 400);

    g.prop("BACKUP_RETENTION", "2");
    for (let i = 0; i < 3; i++) {
      g.emu.now += 60_000;
      await new Promise((r) => setTimeout(r, 5));
      assert.equal((await g.req("POST", "/api/admin/backups", {})).ok, true);
    }
    const live = g.sheet("Files").slice(1).filter((r) => r[col(g.sheet("Files"), "kind")] === "BACKUP" && r[col(g.sheet("Files"), "deleted")] !== true);
    assert.equal(live.length, 2);

    // scheduled trigger entry point
    g.call("dailyBackup");
    assert.ok(g.sheet("AuditLogs").some((r) => String(r[col(g.sheet("AuditLogs"), "details")]).startsWith("scheduled:")));
    const list = await g.req("GET", "/api/admin/files");
    assert.ok(list.data.files.length >= 3);
  });

  it("medicine catalogue: sheet is the source of truth; admin edits + Re-import validate and bump the version", async () => {
    await g.login(ADMIN.email, ADMIN.password);
    const v1 = (await g.req("GET", "/api/medicines/version")).data.version;
    const cat = await g.req("GET", "/api/medicines/catalogue");
    assert.equal(cat.data.rows.length, 21714);
    assert.equal(cat.data.version, v1);
    const search = await g.req("GET", "/api/medicines/search?q=napa&limit=5");
    assert.ok(search.data.items[0].brandName.toLowerCase().startsWith("napa"));

    // an admin edits the sheet directly: one new medicine + one duplicate id
    const ss = g.emu.spreadsheets.get(g.prop("SPREADSHEET_ID")!);
    const med = ss.sheets.find((s: any) => s.name === "Medicines");
    const last = g.sheet("Medicines").length;
    med.grid[last] = ["999001", "Zztestmed", "allopathic", "", "Tablet", "Testgeneric", "10 mg", "ACME", "", ""];
    med.grid[last + 1] = ["999001", "Duplicate", "allopathic", "", "Tablet", "x", "", "", "", ""];
    g.emu.cache.clear();
    const imp = await g.req("POST", "/api/admin/medicines/import", {});
    assert.equal(imp.ok, true, imp.error);
    assert.equal(imp.data.imported, 21715);
    assert.equal(imp.data.errors.length, 1);
    assert.match(imp.data.errors[0], /duplicate brand id 999001/);
    const v2 = (await g.req("GET", "/api/medicines/version")).data.version;
    assert.notEqual(v1, v2);
    assert.equal((await g.req("GET", "/api/medicines/search?q=Zztestmed")).data.items.length, 1);
    assert.equal((await g.req("POST", "/api/admin/medicines/import", {}, doctorToken)).status, 403);
    med.grid.splice(last, 2);
  });

  it("libraries: custom entries go to the CustomEntries sheet, masters stay untouched", async () => {
    const before = g.sheet("Advice").length;
    const r = await g.req("POST", "/api/libraries", { category: "ADVICE", labelEn: "Avoid cold drinks", labelBn: "ঠান্ডা পানীয় এড়িয়ে চলুন" }, doctorToken);
    assert.equal(r.ok, true, r.error);
    assert.equal(g.sheet("Advice").length, before);
    const ce = g.sheet("CustomEntries");
    assert.equal(ce.length, 2);
    assert.equal(asObj(ce, 1).labelEn, "Avoid cold drinks");
    assert.equal((await g.req("POST", "/api/libraries", { category: "ADVICE", labelEn: "Avoid cold drinks" }, doctorToken)).data.item.id, r.data.item.id);
    const all = await g.req("GET", "/api/libraries/all", undefined, doctorToken);
    assert.ok(all.data.items.some((i: any) => i.labelEn === "Avoid cold drinks"));
  });

  it("audit trail is appended to the AuditLogs sheet and readable by admins only", async () => {
    const rows = g.sheet("AuditLogs");
    const actions = new Set(rows.slice(1).map((r) => r[col(rows, "action")]));
    for (const a of ["LOGIN", "CREATE", "UPDATE", "FINALIZE", "REVISE", "UPLOAD", "DOWNLOAD", "DELETE", "BACKUP", "EXPORT"]) assert.ok(actions.has(a), `audit action ${a}`);
    await g.login(ADMIN.email, ADMIN.password);
    const logs = await g.req("GET", "/api/admin/audit-logs?limit=20");
    assert.equal(logs.data.logs.length, 20);
    assert.ok(logs.data.logs[0].createdAt >= logs.data.logs[19].createdAt);
    assert.equal((await g.req("GET", "/api/admin/audit-logs", undefined, doctorToken)).status, 403);
  });

  it("performance & reliability: writers are serialised under the script lock; reads hit the cache", async () => {
    const locks = g.emu.stats.lockWaits;
    await g.req("POST", "/api/patients", { name: "Lock Test" }, assistantToken);
    assert.equal(g.emu.stats.lockWaits, locks + 1);
    assert.equal(g.emu.lockHeld, false, "lock released");

    await g.req("GET", "/api/patients", undefined, doctorToken); // warm
    const reads = g.emu.stats.sheetReads;
    await g.req("GET", "/api/patients", undefined, doctorToken);
    assert.equal(g.emu.stats.sheetReads, reads + 0, "second read is served from CacheService, no sheet read");

    // a failing request releases the lock and writes nothing
    const writes = g.emu.stats.sheetWrites;
    assert.equal((await g.req("POST", "/api/patients", { name: "" }, assistantToken)).ok, false);
    assert.equal(g.emu.lockHeld, false);
    assert.equal(g.emu.stats.sheetWrites, writes);

    // concurrent-writer protection: a second writer while the lock is held fails cleanly
    g.emu.lockHeld = true;
    const blocked = await g.req("POST", "/api/patients", { name: "Blocked" }, assistantToken);
    assert.equal(blocked.ok, false);
    assert.match(blocked.error!, /Lock timeout/);
    g.emu.lockHeld = false;
  });

  it("only changed rows are written (diff sync) — an edit touches one row, not the table", async () => {
    const before = g.emu.stats.sheetWrites;
    await g.req("PUT", `/api/patients/${patientId}`, { address: "Chittagong" }, assistantToken);
    const writes = g.emu.stats.sheetWrites - before;
    assert.ok(writes <= 3, `expected ≤3 sheet writes for a single-row edit (got ${writes})`); // 1 row + 1 audit append (+1 cache)
  });

  it("manual edits in Google Sheets are picked up once the cache expires (or after clearCaches)", async () => {
    const ss = g.emu.spreadsheets.get(g.prop("SPREADSHEET_ID")!);
    const sh = ss.sheets.find((s: any) => s.name === "Patients");
    const idx = sh.grid.findIndex((r: any[]) => r[0] === patientId);
    sh.grid[idx][col(sh.grid, "name")] = "Rahim U. (edited in Sheets)";
    g.emu.now += 11 * 60_000;
    assert.equal((await g.req("GET", `/api/patients/${patientId}`, undefined, doctorToken)).data.patient.name, "Rahim U. (edited in Sheets)");
    g.call("clearCaches");
  });

  it("resetAdminPassword (recovery): resets / creates the admin, unlocks, and removes the property", async () => {
    // wrong credentials → can't log in (e.g. password changed after the first setup run)
    g.prop("ADMIN_EMAIL", ADMIN.email);
    g.prop("ADMIN_PASSWORD", "Totally-New-Admin-Pass-1");
    assert.equal((await g.login(ADMIN.email, "Totally-New-Admin-Pass-1")).status, 401);
    for (let i = 0; i < 6; i++) await g.login(ADMIN.email, "bad");
    assert.equal((await g.login(ADMIN.email, "bad")).status, 429);

    assert.match(g.call("resetAdminPassword"), /Password reset for boss@clinic.test/);
    assert.equal(g.prop("ADMIN_PASSWORD"), null);
    assert.equal((await g.login(ADMIN.email, "Totally-New-Admin-Pass-1")).ok, true);
    assert.equal((await g.login(ADMIN.email, ADMIN.password)).status, 401);
    assert.ok(!allCells().some((c) => c.includes("Totally-New-Admin-Pass-1")));
    assert.equal(g.sheet("Users").filter((r) => r[1] === ADMIN.email).length, 1, "no duplicate admin row");

    // a brand-new address creates a second super admin
    g.prop("ADMIN_EMAIL", "second@clinic.test");
    g.prop("ADMIN_PASSWORD", "Second-Admin-Pass-22");
    assert.match(g.call("resetAdminPassword"), /Admin created for second@clinic.test/);
    assert.equal((await g.login("second@clinic.test", "Second-Admin-Pass-22")).data.user.role, "SUPER_ADMIN");

    g.prop("ADMIN_EMAIL", ADMIN.email);
    g.prop("ADMIN_PASSWORD", "short");
    assert.throws(() => g.call("resetAdminPassword"), /min\. 10 characters/);
  });

  it("rejects malformed or oversized requests and unknown routes", async () => {
    const out = g.ctx.doPost({ postData: { contents: "not json" } });
    assert.equal(JSON.parse(out.getContent()).status, 400);
    assert.equal((await g.req("GET", "/etc/passwd")).status, 400);
    assert.equal((await g.req("GET", "/api/does-not-exist", undefined, doctorToken)).status, 404);
    assert.equal(createHash("sha256").update("").digest("hex").length, 64);
  });
});
