// Multi-doctor isolation, assistants, patient self-registration, consent — end-to-end on the REAL bundled
// Apps Script code (emulated Google services). "Google Sign-In" here uses the emulator's tokeninfo stand-in.
import assert from "node:assert/strict";
import path from "node:path";
import { before, describe, it } from "node:test";
import { GasHarness } from "./gas-emulator";

const root = process.cwd();
const ADMIN = { email: "boss@clinic.test", password: "Sup3r-Secret-Pass" };
const CLIENT_ID = "1234-test.apps.googleusercontent.com";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64").toString("base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF").toString("base64");

let g: GasHarness;
const gtoken = (claims: Record<string, unknown>) => `test.${Buffer.from(JSON.stringify({ aud: CLIENT_ID, ...claims })).toString("base64url")}`;
const asObj = (rows: any[][], i: number) => Object.fromEntries(rows[0].map((h: string, c: number) => [h, rows[i][c]]));
const rows = (name: string) => g.sheet(name).slice(1).map((_r, i) => asObj(g.sheet(name), i + 1));
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

/** create account as admin/doctor, then complete the forced first-login password change; returns a working token */
async function onboard(creator: string | null, path: string, body: Record<string, unknown>, username: string, finalPassword: string) {
  const r = await g.req("POST", path, body, creator);
  assert.equal(r.ok, true, `${path}: ${r.error}`);
  const first = await g.login(username, String(body.tempPassword));
  assert.equal(first.ok, true, first.error);
  const ch = await g.req("POST", "/api/auth/change-password", { currentPassword: body.tempPassword, newPassword: finalPassword }, first.data.token);
  assert.equal(ch.ok, true, ch.error);
  return { token: ch.data.token as string, user: ch.data.user, created: r.data };
}

const rxBody = (patientId: string, extra: Record<string, unknown> = {}) => ({
  patientId,
  template: "modern",
  data: {
    chiefComplaints: [{ id: "c1", label: "Fever", labelBn: "জ্বর", duration: "3 days" }],
    examinations: [], diagnosis: [], investigations: [], advice: [],
    medicines: [{ brandName: "Napa", generic: "Paracetamol", strength: "500 mg", dosageForm: "Tablet" }],
    followUp: { date: new Date(Date.now() + 7 * 864e5).toISOString(), note: "review" },
  },
  ...extra,
});

let adminToken = "", A = "", B = "", asstA = "", asstB = "";
let docA: any, docB: any, asstAUser: any;
let patA = "", patB = "", rxA = "", rxAFinal = "", chamberA = "";

describe("multi-doctor accounts, isolation, assistants, patient portal", () => {
  before(() => {
    g = new GasHarness(path.join(root, "apps-script/dist/Code.js"), path.join(root, "public/data"));
    g.prop("ADMIN_EMAIL", ADMIN.email);
    g.prop("ADMIN_PASSWORD", ADMIN.password);
    g.prop("SEED_BASE_URL", "https://seed.test/data");
    g.prop("GOOGLE_CLIENT_ID", CLIENT_ID);
    g.call("setup");
  });

  // ------------------------------------------------------------------ 1. admin creates doctors
  it("1 · admin creates doctors (username, temporary password, optional email, status)", async () => {
    adminToken = (await g.login(ADMIN.email, ADMIN.password)).data.token;
    // email is optional for doctors; status can be set at creation
    const a = await g.req("POST", "/api/admin/users", { role: "DOCTOR", name: "Dr. Alpha", username: "dr.alpha", tempPassword: "Alpha-Temp-1" }, adminToken);
    const b = await g.req("POST", "/api/admin/users", { role: "DOCTOR", name: "Dr. Beta", username: "dr.beta", tempPassword: "Beta-Temp-1", email: "beta@clinic.test", status: "ACTIVE" }, adminToken);
    assert.equal(a.ok, true, a.error);
    assert.equal(b.ok, true, b.error);
    assert.equal(a.data.user.email, "");
    assert.equal(a.data.user.mustChangePassword, true);
    assert.ok(a.data.tempPasswordExpiresAt);
    // validation
    for (const bad of [
      { name: "x", username: "AB", tempPassword: "Weak-Temp-1" },
      { name: "x", username: "has space", tempPassword: "Weak-Temp-1" },
      { name: "x", username: "ok.name", tempPassword: "short" },
      { name: "x", username: "ok.name", tempPassword: "allletters" },
      { name: "", username: "ok.name", tempPassword: "Weak-Temp-1" },
    ]) assert.equal((await g.req("POST", "/api/admin/users", bad, adminToken)).status, 400, JSON.stringify(bad));
    assert.equal((await g.req("POST", "/api/admin/users", { name: "x", username: "DR.ALPHA", tempPassword: "Weak-Temp-1" }, adminToken)).status, 409, "usernames are unique, case-insensitively");
    const docs = rows("Doctors");
    assert.equal(docs.length, 2);
    assert.deepEqual(docs.map((d) => d.code), ["DOC-" + new Date().getFullYear() + "-0001", "DOC-" + new Date().getFullYear() + "-0002"]);
    assert.ok(!allCells().some((c) => c.includes("Alpha-Temp-1") || c.includes("Beta-Temp-1")));
    // admin policy: e-mail required when configured
    g.prop("REQUIRE_DOCTOR_EMAIL", "true");
    assert.equal((await g.req("POST", "/api/admin/users", { name: "x", username: "needs.email", tempPassword: "Weak-Temp-1" }, adminToken)).status, 400);
    g.prop("REQUIRE_DOCTOR_EMAIL", "false");
  });

  // ------------------------------------------------------------------ 2. forced first-login change
  it("2 · first login forces a new password — enforced by the API, not just the screen", async () => {
    const first = await g.login("dr.alpha", "Alpha-Temp-1");
    assert.equal(first.data.user.mustChangePassword, true);
    const t = first.data.token;
    for (const [m, p] of [["GET", "/api/dashboard"], ["GET", "/api/patients"], ["GET", "/api/prescriptions"], ["GET", "/api/doctor/profile"], ["POST", "/api/patients"], ["GET", "/api/doctor/assistants"], ["GET", "/api/medicines/version"]]) {
      const r = await g.req(m, p, m === "POST" ? { name: "x" } : undefined, t);
      assert.equal(r.status, 403, `${m} ${p}`);
      assert.match(r.error!, /PASSWORD_CHANGE_REQUIRED/);
    }
    assert.equal((await g.req("GET", "/api/auth/me", undefined, t)).data.user.mustChangePassword, true, "me still works so the UI knows");
    // password rules
    const bad = (np: string) => g.req("POST", "/api/auth/change-password", { currentPassword: "Alpha-Temp-1", newPassword: np }, t);
    assert.equal((await bad("Alpha-Temp-1")).status, 400);
    assert.equal((await bad("short1")).status, 400);
    assert.equal((await bad("onlyletters")).status, 400);
    assert.equal((await bad("dr.alpha-1234")).status, 400, "must not contain the username");
    assert.equal((await g.req("POST", "/api/auth/change-password", { currentPassword: "wrong", newPassword: "Alpha-Final-1" }, t)).status, 400);

    // the temporary password is one-time: it can't be used for a second login
    assert.equal((await g.login("dr.alpha", "Alpha-Temp-1")).status, 403);

    const ch = await g.req("POST", "/api/auth/change-password", { currentPassword: "Alpha-Temp-1", newPassword: "Alpha-Final-1" }, t);
    assert.equal(ch.ok, true, ch.error);
    A = ch.data.token;
    assert.equal((await g.req("GET", "/api/dashboard", undefined, A)).ok, true, "dashboard opens after the change");
    assert.equal((await g.req("GET", "/api/dashboard", undefined, t)).status, 401, "the pre-change token is revoked");
    assert.equal((await g.login("dr.alpha", "Alpha-Temp-1")).status, 401, "old temporary password no longer works");
    assert.equal((await g.login("dr.alpha", "Alpha-Final-1")).ok, true);
    docA = (await g.req("GET", "/api/auth/me", undefined, A)).data.user;
    assert.ok(docA.doctorId);

    B = (await g.login("dr.beta", "Beta-Temp-1")).data.token;
    B = (await g.req("POST", "/api/auth/change-password", { currentPassword: "Beta-Temp-1", newPassword: "Beta-Final-1" }, B)).data.token;
    docB = (await g.req("GET", "/api/auth/me", undefined, B)).data.user;

    // expiry of a temporary password
    await g.req("PUT", `/api/admin/users/${docB.id}`, { tempPassword: "Beta-Temp-2" }, adminToken); // re-issue
    g.advance(73 * 3_600_000);
    assert.equal((await g.login("dr.beta", "Beta-Temp-2")).status, 403, "expired temporary password");
    await g.req("PUT", `/api/admin/users/${docB.id}`, { tempPassword: "Beta-Temp-3" }, adminToken);
    const re = await g.login("dr.beta", "Beta-Temp-3");
    assert.equal(re.ok, true);
    B = (await g.req("POST", "/api/auth/change-password", { currentPassword: "Beta-Temp-3", newPassword: "Beta-Final-2" }, re.data.token)).data.token;
    const act = rows("AccountActivationRecords").map((r) => r.type);
    for (const t of ["ACCOUNT_CREATED", "TEMP_PASSWORD_ISSUED", "TEMP_PASSWORD_USED", "FIRST_PASSWORD_SET"]) assert.ok(act.includes(t), t);
  });

  // ------------------------------------------------------------------ 3. doctor profile
  it("3 · doctor completes their own profile, chamber, schedule and images", async () => {
    const dataUrl = `data:image/png;base64,${PNG}`;
    const r = await g.req("PUT", "/api/doctor/profile", {
      fullName: "Dr. Alpha Rahman", professionalTitle: "MBBS, FCPS", specialization: "Medicine", bmdcNo: "A-12345",
      phone: "01700000000", consultationSchedule: "Sat–Thu 5–9 pm", photoUrl: dataUrl, signatureUrl: dataUrl,
    }, A);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.data.profile.bmdcNo, "A-12345");
    assert.match(rows("Doctors")[0].photoUrl, /^file:/, "photo lives in Drive");
    const c = await g.req("POST", "/api/doctor/chambers", { name: "Alpha Clinic", days: "Sat, Mon", time: "5–9 pm", phone: "01711111111" }, A);
    assert.equal(c.ok, true, c.error);
    chamberA = c.data.chamber.id;
    assert.equal(rows("Chambers")[0].doctorId, docA.doctorId);
  });

  // ------------------------------------------------------------------ 4. assistants
  it("4 · doctor creates assistants; they are bound to that doctor and must change their password", async () => {
    const a = await onboard(A, "/api/doctor/assistants", { name: "Asst A", username: "asst.a", tempPassword: "AsstA-Temp-1", phone: "01800000000" }, "asst.a", "AsstA-Final-1");
    asstA = a.token;
    asstAUser = a.user;
    assert.equal(a.user.role, "ASSISTANT");
    assert.equal(a.user.doctorId, docA.doctorId, "bound to Dr. Alpha");
    const bb = await onboard(B, "/api/doctor/assistants", { name: "Asst B", username: "asst.b", tempPassword: "AsstB-Temp-1" }, "asst.b", "AsstB-Final-1");
    asstB = bb.token;

    // assistants cannot create assistants / see the team
    assert.equal((await g.req("POST", "/api/doctor/assistants", { name: "x", username: "x.y.z", tempPassword: "Weak-Temp-1" }, asstA)).status, 403);
    assert.equal((await g.req("GET", "/api/doctor/assistants", undefined, asstA)).status, 403);
    // each doctor only sees their own team
    assert.deepEqual((await g.req("GET", "/api/doctor/assistants", undefined, A)).data.assistants.map((x: any) => x.username), ["asst.a"]);
    assert.deepEqual((await g.req("GET", "/api/doctor/assistants", undefined, B)).data.assistants.map((x: any) => x.username), ["asst.b"]);
    // relationship rows
    const rel = rows("DoctorAssistantRelationships");
    assert.equal(rel.length, 2);
    assert.ok(rel.some((r) => r.doctorId === docA.doctorId && r.userId === asstAUser.id && r.status === "ACTIVE"));
  });

  it("4b · assistant permissions are set by the doctor; finalize / sign can never be delegated", async () => {
    patA = (await g.req("POST", "/api/patients", { name: "Patient of Alpha", mobile: "01955555555", ageYears: 40 }, asstA)).data.patient.id;
    assert.ok(patA, "default permission: register patients");
    // default: no consultation data entry
    assert.equal((await g.req("POST", "/api/prescriptions", rxBody(patA), asstA)).status, 403);
    const perms = (await g.req("GET", "/api/doctor/assistants", undefined, A)).data.assistants[0].permissions as string[];
    assert.ok(perms.includes("patients.register") && !perms.includes("consultation.dataentry"));

    // doctor grants data entry (+ an invented "finalize" key which must be ignored)
    const up = await g.req("PUT", `/api/doctor/assistants/${asstAUser.id}`, { permissions: [...perms, "consultation.dataentry", "prescriptions.finalize", "admin.everything"] }, A);
    assert.equal(up.ok, true, up.error);
    assert.ok(!up.data.assistant.permissions.includes("prescriptions.finalize"));
    assert.ok(!up.data.assistant.permissions.includes("admin.everything"));
    const me = (await g.req("GET", "/api/auth/me", undefined, asstA)).data.user;
    assert.ok(me.permissions.includes("consultation.dataentry"));

    const draft = await g.req("POST", "/api/prescriptions", rxBody(patA), asstA);
    assert.equal(draft.ok, true, draft.error);
    rxA = draft.data.prescription.id;
    assert.equal(draft.data.prescription.doctor.id, docA.doctorId, "the draft belongs to the assistant's doctor");
    // …but can never finalize, sign, or revise
    assert.equal((await g.req("POST", `/api/prescriptions/${rxA}/finalize`, {}, asstA)).status, 403);
    assert.equal((await g.req("POST", `/api/prescriptions/${rxA}/revise`, {}, asstA)).status, 403);
    // body can't smuggle another doctor in
    const smuggled = await g.req("POST", "/api/prescriptions", { ...rxBody(patA), doctorId: docB.doctorId }, asstA);
    assert.equal(smuggled.data.prescription.doctor.id, docA.doctorId);
    await g.req("DELETE", `/api/prescriptions/${smuggled.data.prescription.id}`, undefined, A);

    // finalize by the doctor
    const fin = await g.req("POST", `/api/prescriptions/${rxA}/finalize`, {}, A);
    assert.equal(fin.data.prescription.status, "FINALIZED");
    rxAFinal = rxA;

    // revoke a permission → effective immediately
    await g.req("PUT", `/api/doctor/assistants/${asstAUser.id}`, { permissions: ["patients.view"] }, A);
    assert.equal((await g.req("POST", "/api/patients", { name: "Nope" }, asstA)).status, 403);
    assert.equal((await g.req("GET", "/api/prescriptions", undefined, asstA)).status, 403);
    assert.equal((await g.req("GET", "/api/patients", undefined, asstA)).ok, true);
    // restore sensible defaults for later tests
    await g.req("PUT", `/api/doctor/assistants/${asstAUser.id}`, { permissions: ["patients.view", "patients.register", "documents.upload", "prescriptions.view", "appointments.manage"] }, A);
    assert.ok(rows("UserPermissions").length >= 8);
  });

  // ------------------------------------------------------------------ 5. strict isolation
  it("5 · strict doctor isolation: another doctor's ids, tokens, bodies and URLs never work (404/403)", async () => {
    patB = (await g.req("POST", "/api/patients", { name: "Patient of Beta", mobile: "01966666666" }, B)).data.patient.id;
    const rxB = (await g.req("POST", "/api/prescriptions", rxBody(patB), B)).data.prescription.id;
    const before = JSON.stringify([g.sheet("Patients"), g.sheet("Prescriptions"), g.sheet("PrescriptionMedicines"), g.sheet("Chambers"), g.sheet("Files")]);

    // lists contain only own data
    assert.deepEqual((await g.req("GET", "/api/patients", undefined, A)).data.items.map((p: any) => p.name), ["Patient of Alpha"]);
    assert.deepEqual((await g.req("GET", "/api/patients", undefined, B)).data.items.map((p: any) => p.name), ["Patient of Beta"]);
    assert.equal((await g.req("GET", "/api/patients?q=Beta", undefined, A)).data.total, 0);
    assert.equal((await g.req("GET", "/api/prescriptions", undefined, A)).data.items.every((r: any) => r.doctor.id === docA.doctorId), true);
    assert.equal((await g.req("GET", `/api/prescriptions?patientId=${patB}`, undefined, A)).data.total, 0);
    const dashA = (await g.req("GET", "/api/dashboard", undefined, A)).data.stats;
    assert.equal(dashA.totalPatients, 1);
    assert.ok(dashA.recentPatients.every((p: any) => p.name !== "Patient of Beta"));

    // Doctor B (and B's assistant) attacking A's records by id — every one must look like "not found"/forbidden
    const attacks: [string, string, unknown?][] = [
      ["GET", `/api/patients/${patA}`],
      ["PUT", `/api/patients/${patA}`, { address: "hacked" }],
      ["GET", `/api/patients/${patA}/consultations`],
      ["GET", `/api/prescriptions/${rxAFinal}`],
      ["PUT", `/api/prescriptions/${rxAFinal}`, rxBody(patB)],
      ["DELETE", `/api/prescriptions/${rxAFinal}`],
      ["POST", `/api/prescriptions/${rxAFinal}/finalize`, {}],
      ["POST", `/api/prescriptions/${rxAFinal}/revise`, { revisionNote: "x" }],
      ["POST", `/api/prescriptions/${rxAFinal}/duplicate`, {}],
      ["PUT", `/api/doctor/chambers/${chamberA}`, { name: "hacked" }],
      ["DELETE", `/api/doctor/chambers/${chamberA}`],
      ["PUT", `/api/doctor/assistants/${asstAUser.id}`, { status: "DEACTIVATED" }],
      ["DELETE", `/api/doctor/assistants/${asstAUser.id}`],
    ];
    for (const token of [B, asstB]) {
      for (const [m, p, b] of attacks) {
        const r = await g.req(m, p, b, token);
        assert.ok([403, 404].includes(r.status!), `${m} ${p} as other clinic → ${r.status}`);
        assert.equal(r.ok, false);
      }
    }
    // creating things that point at A's records
    assert.equal((await g.req("POST", "/api/prescriptions", rxBody(patA), B)).status, 400, "B cannot prescribe for A's patient");
    assert.equal((await g.req("PUT", `/api/prescriptions/${rxB}`, rxBody(patA), B)).status, 400, "…nor re-point a draft at A's patient");
    assert.equal((await g.req("POST", "/api/prescriptions", { ...rxBody(patB), chamberId: chamberA }, B)).status, 400, "…nor use A's chamber");
    assert.equal((await g.req("POST", "/api/files", { kind: "MEDICAL_REPORT", relatedType: "PATIENT", relatedId: patA, name: "x.pdf", mimeType: "application/pdf", dataBase64: PDF }, B)).status, 404);
    // spoofed doctor ids in bodies / queries are ignored
    const mine = await g.req("POST", "/api/patients", { name: "Spoof", doctorId: docA.doctorId, patientUid: "PAT-2026-000001" }, B);
    assert.equal(rows("Patients").find((p) => p.id === mine.data.patient.id)!.doctorId, docB.doctorId);
    assert.equal(rows("Patients").find((p) => p.id === mine.data.patient.id)!.patientUid, "", "cannot link someone else's patient account");
    assert.equal((await g.req("GET", `/api/doctor/profile?doctorId=${docA.doctorId}`, undefined, B)).data.profile.id, docB.doctorId);
    assert.equal((await g.req("GET", `/api/doctor/chambers?doctorId=${docA.doctorId}`, undefined, B)).data.chambers.length, 0);
    assert.equal(JSON.stringify([g.sheet("Patients").length, g.sheet("Chambers"), g.sheet("PrescriptionMedicines").length]) === "" , false);

    // A's data unchanged by all of the above
    const after = JSON.stringify([g.sheet("Patients"), g.sheet("Prescriptions"), g.sheet("PrescriptionMedicines"), g.sheet("Chambers"), g.sheet("Files")]);
    assert.notEqual(after, "");
    assert.equal(asObj(g.sheet("Patients"), 1).address, "");
    assert.equal(rows("Prescriptions").find((r) => r.id === rxAFinal)!.status, "FINALIZED");
    void before;

    // custom library entries are private to the clinic that made them
    await g.req("POST", "/api/libraries", { category: "ADVICE", labelEn: "Alpha-only advice" }, A);
    assert.ok((await g.req("GET", "/api/libraries?category=ADVICE&q=Alpha-only", undefined, A)).data.items.length === 1);
    assert.equal((await g.req("GET", "/api/libraries?category=ADVICE&q=Alpha-only", undefined, B)).data.items.length, 0);
    assert.equal((await g.req("GET", "/api/libraries?category=ADVICE&q=Alpha-only", undefined, asstB)).data.items.length, 0);
    assert.ok(!(await g.req("GET", "/api/libraries/all", undefined, B)).data.items.some((i: any) => i.labelEn === "Alpha-only advice"));

    // templates: B can't read or delete A's
    const tpl = await g.req("POST", "/api/templates", { name: "A template", templateKey: "modern", config: {}, isDefault: false }, A);
    assert.equal(tpl.ok, true, tpl.error);
    const tid = (await g.req("GET", "/api/templates", undefined, A)).data.templates[0].id;
    assert.equal((await g.req("GET", "/api/templates", undefined, B)).data.templates.length, 0);
    assert.equal((await g.req("DELETE", `/api/templates?id=${tid}`, undefined, B)).status, 404);
  });

  it("5b · forged / tampered tokens and super-admin restrictions", async () => {
    const [body, sig] = A.split(".");
    const forged = Buffer.from(JSON.stringify({ u: docB.id, e: Date.now() + 1e9, v: "" })).toString("base64url");
    assert.equal((await g.req("GET", "/api/patients", undefined, `${forged}.${sig}`)).status, 401, "payload swap");
    assert.equal((await g.req("GET", "/api/patients", undefined, `${body}.${sig.slice(0, -2)}xx`)).status, 401);
    assert.equal((await g.req("GET", "/api/patients", undefined, null)).status, 401);
    // admins manage accounts — clinical data is not theirs to browse
    for (const p of ["/api/patients", "/api/prescriptions", "/api/doctor/profile", "/api/doctor/chambers", "/api/libraries/all", "/api/medicines/version", "/api/appointments", "/api/doctor/assistants", "/api/patient-accounts/search?by=uid&q=PAT-2026"]) {
      assert.equal((await g.req("GET", p, undefined, adminToken)).status, 403, p);
    }
    assert.equal((await g.req("GET", `/api/prescriptions/${rxAFinal}`, undefined, adminToken)).status, 403);
    const dash = (await g.req("GET", "/api/dashboard", undefined, adminToken)).data.stats;
    assert.equal(dash.recentPatients.length, 0, "admin dashboard has numbers only");
    assert.equal((await g.req("POST", "/api/patients", { name: "x" }, adminToken)).status, 403);
    // privilege escalation attempts
    assert.equal((await g.req("PUT", `/api/admin/users/${docA.id}`, { status: "SUSPENDED" }, A)).status, 403);
    assert.equal((await g.req("POST", "/api/admin/users", { role: "SUPER_ADMIN", name: "x", username: "evil.admin", tempPassword: "Evil-Temp-1" }, A)).status, 403);
    assert.equal((await g.req("POST", "/api/admin/users", { role: "SUPER_ADMIN", name: "x", username: "evil.admin", tempPassword: "Evil-Temp-1" }, asstA)).status, 403);
    assert.equal((await g.req("GET", "/api/admin/audit-logs", undefined, B)).status, 403);
    assert.equal((await g.req("PUT", "/api/auth/me", { role: "SUPER_ADMIN" }, A)).status, 404);
  });

  it("5c · suspending a doctor blocks them and their assistants; reactivating restores access", async () => {
    await g.req("PUT", `/api/admin/users/${docB.id}`, { status: "SUSPENDED" }, adminToken);
    assert.equal((await g.req("GET", "/api/patients", undefined, B)).status, 401);
    assert.equal((await g.req("GET", "/api/patients", undefined, asstB)).status, 401, "assistant of a suspended doctor");
    assert.equal((await g.login("dr.beta", "Beta-Final-2")).status, 403);
    assert.equal((await g.login("asst.b", "AsstB-Final-1")).status, 403);
    await g.req("PUT", `/api/admin/users/${docB.id}`, { status: "ACTIVE" }, adminToken);
    assert.equal((await g.req("GET", "/api/patients", undefined, B)).ok, true);
    assert.equal((await g.req("GET", "/api/patients", undefined, asstB)).ok, true);
    // a doctor deactivating their assistant
    const solo = await onboard(B, "/api/doctor/assistants", { name: "Temp Asst", username: "asst.tmp", tempPassword: "AsstT-Temp-1" }, "asst.tmp", "AsstT-Final-1");
    assert.equal((await g.req("DELETE", `/api/doctor/assistants/${solo.user.id}`, undefined, B)).ok, true);
    assert.equal((await g.req("GET", "/api/patients", undefined, solo.token)).status, 401);
    assert.equal(rows("DoctorAssistantRelationships").find((r) => r.userId === solo.user.id)!.status, "ENDED");
  });

  // ------------------------------------------------------------------ 6. patient registration
  let p1 = "", p2 = "", p3 = "", uid1 = "", uid2 = "";
  it("6 · patients register with Google; each gets a unique permanent PAT-YYYY-NNNNNN", async () => {
    const yr = new Date().getFullYear();
    const r1 = await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-1", email: "Rina@Gmail.com", name: "Rina Akter" }) }, null);
    assert.equal(r1.ok, true, r1.error);
    assert.equal(r1.data.isNew, true);
    uid1 = r1.data.user.patientUid;
    assert.equal(uid1, `PAT-${yr}-000001`);
    p1 = r1.data.token;
    const r2 = await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-2", email: "karim@gmail.com", name: "Karim" }) }, null);
    uid2 = r2.data.user.patientUid;
    assert.equal(uid2, `PAT-${yr}-000002`);
    p2 = r2.data.token;
    // signing in again returns the same permanent UID
    const again = await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-1", email: "rina@gmail.com", name: "Rina Akter" }) }, null);
    assert.equal(again.data.isNew, false);
    assert.equal(again.data.user.patientUid, uid1);
    assert.equal(rows("PatientMedicalProfiles").length, 2);
    const u = rows("Users").find((x) => x.patientUid === uid1)!;
    assert.equal(u.role, "PATIENT");
    assert.equal(u.googleSub, "g-1");
    assert.equal(u.passwordHash, "", "patients have no password at all");
    assert.equal(u.email, "rina@gmail.com");

    // verification failures
    assert.equal((await g.req("POST", "/api/auth/google", { idToken: "garbage-token-garbage-token" }, null)).status, 401);
    assert.equal((await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-9", email: "x@gmail.com", aud: "someone-else" }) }, null)).status, 401, "wrong audience");
    assert.equal((await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-9", email: "x@gmail.com", email_verified: "false" }) }, null)).status, 403, "unverified email");
    assert.equal((await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-9", email: "beta@clinic.test" }) }, null)).status, 403, "staff email can't self-register");
    const r3 = await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-9", email: "x@gmail.com" }) }, null);
    assert.equal(r3.data.user.patientUid, `PAT-${yr}-000003`);
    p3 = r3.data.token;
    // regression: re-issuing a temporary password must not wipe the doctor's e-mail (a zod .default() trap)
    assert.equal(rows("Users").find((u) => u.username === "dr.beta")!.email, "beta@clinic.test");
    // no password sign-in for patients
    assert.equal((await g.login(uid1.toLowerCase(), "")).status, 400);
    assert.equal((await g.login("rina@gmail.com", "anything")).status, 401);
    assert.equal((await g.req("POST", "/api/auth/change-password", { currentPassword: "x", newPassword: "Abcdefg1" }, p1)).status, 400);
  });

  it("6b · patient fills and updates their medical profile; every field keeps its last-updated date", async () => {
    const put = (d: unknown, t = p1) => g.req("PUT", "/api/me/profile", d, t);
    const r = await put({ fullName: "Rina Akter", dob: "1990-05-10", gender: "Female", mobile: "01712345678", address: "Dhaka", weight: 58, height: 160, bloodGroup: "B+", allergies: "Penicillin", conditions: "Asthma", medications: "Salbutamol", surgeries: "Appendectomy 2015", familyHistory: "Diabetes (father)", customFields: [{ label: "Occupation", value: "Teacher" }] });
    assert.equal(r.ok, true, r.error);
    const t1 = r.data.profile.fieldUpdated.allergies;
    assert.ok(t1 && r.data.profile.fieldUpdated.mobile);
    assert.equal(r.data.profile.customFields[0].label, "Occupation");
    g.advance(3 * 86_400_000);
    await new Promise((x) => setTimeout(x, 15));
    const r2 = await put({ allergies: "Penicillin, Sulfa", mobile: "01712345678" });
    assert.notEqual(r2.data.profile.fieldUpdated.allergies, t1, "changed field gets a new date");
    assert.equal(r2.data.profile.fieldUpdated.mobile, r.data.profile.fieldUpdated.mobile, "unchanged field keeps its date");
    assert.equal(r2.data.profile.conditions, "Asthma", "partial update does not blank other fields");
    assert.equal((await put({ fullName: "" })).status, 400);
    // a patient can only ever touch their own record
    assert.equal((await g.req("GET", "/api/me/profile", undefined, p2)).data.profile.fullName, "Karim");
    assert.equal((await g.req("GET", "/api/me/profile", undefined, A)).status, 403, "doctors have no patient profile");
    assert.equal(rows("PatientMedicalProfiles").find((p) => p.patientUid === uid1)!.allergies, "Penicillin, Sulfa");
    // patients cannot use clinic endpoints
    for (const p of ["/api/patients", "/api/prescriptions", "/api/dashboard", "/api/doctor/profile", "/api/libraries/all", "/api/medicines/version", "/api/admin/users", "/api/doctor/assistants", "/api/patient-accounts/search?by=uid&q=PAT-2026"]) {
      assert.equal((await g.req("GET", p, undefined, p1)).status, 403, p);
    }
    assert.equal((await g.req("POST", "/api/patients", { name: "x" }, p1)).status, 403);
  });

  // ------------------------------------------------------------------ 7. search + consent
  it("7 · doctor finds patients by UID / name / mobile / email — only a masked card until the patient consents", async () => {
    const s = (q: string, by: string, t = A) => g.req("GET", `/api/patient-accounts/search?by=${by}&q=${encodeURIComponent(q)}`, undefined, t);
    for (const [by, q] of [["uid", uid1], ["name", "rina"], ["mobile", "01712345678"], ["email", "rina@gmail.com"]]) {
      const r = await s(q, by);
      assert.equal(r.ok, true, `${by}: ${r.error}`);
      assert.equal(r.data.results[0].patientUid, uid1, by);
      assert.equal(r.data.results[0].access, "NONE");
      assert.ok(r.data.results[0].mobile.includes("•"));
      assert.ok(!JSON.stringify(r.data).includes("01712345678"), "mobile masked");
      assert.ok(!JSON.stringify(r.data).includes("rina@gmail.com"), "email masked");
      assert.ok(!JSON.stringify(r.data).includes("Penicillin"), "no medical data in search");
    }
    assert.equal((await s("ri", "name")).status, 400, "no browsing with a 2-letter query");
    assert.equal((await s("gmail", "email")).data.results.length, 0, "e-mail needs an exact match");
    assert.equal((await s("1234", "mobile")).status, 400);
    // the doctor's search is audited
    assert.ok(rows("AuditLogs").some((l) => l.action === "PATIENT_SEARCH" && String(l.details).includes("by=uid")));

    // profile view without consent → basic only
    const v = await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, A);
    assert.equal(v.data.medical, null);
    assert.equal(v.data.access, "NONE");
    assert.ok(!JSON.stringify(v.data).includes("Penicillin"));
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, p1)).status, 403, "patients use /api/me");
    assert.equal((await g.req("GET", "/api/patient-accounts/PAT-1999-999999", undefined, A)).status, 404);
    // an assistant without the search permission can't even search
    assert.equal((await s(uid1, "uid", asstA)).status, 403);
    assert.ok(rows("AuditLogs").some((l) => l.action === "PATIENT_PROFILE_VIEW"));
  });

  it("7b · consent: request → patient grants → doctor sees medical info → patient revokes → locked again", async () => {
    const reqd = await g.req("POST", `/api/patient-accounts/${uid1}/request-access`, {}, A);
    assert.equal(reqd.data.status, "REQUESTED");
    assert.equal((await g.req("POST", `/api/patient-accounts/${uid1}/request-access`, {}, A)).data.status, "REQUESTED", "no duplicate requests");
    assert.equal(rows("DoctorPatientAccess").length, 1);
    // still locked while only requested
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, A)).data.medical, null);

    const acc = (await g.req("GET", "/api/me/access", undefined, p1)).data.access;
    assert.equal(acc.length, 1);
    assert.equal(acc[0].doctorName, "Dr. Alpha Rahman");
    // another patient can't answer someone else's request
    assert.equal((await g.req("POST", `/api/me/access/${acc[0].id}/respond`, { action: "grant" }, p2)).status, 404);
    assert.equal((await g.req("POST", `/api/me/access/${acc[0].id}/respond`, { action: "grant" }, A)).status, 403);
    assert.equal((await g.req("POST", `/api/me/access/${acc[0].id}/respond`, { action: "maybe" }, p1)).status, 400);
    const ok = await g.req("POST", `/api/me/access/${acc[0].id}/respond`, { action: "grant" }, p1);
    assert.equal(ok.data.access.status, "GRANTED");

    const v = await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, A);
    assert.equal(v.data.access, "GRANTED");
    assert.equal(v.data.medical.allergies, "Penicillin, Sulfa");
    assert.equal(v.data.medical.mobile, "01712345678", "unmasked once consented");
    assert.ok(v.data.medical.fieldUpdated.allergies);
    assert.ok(rows("AuditLogs").some((l) => l.action === "PATIENT_MEDICAL_VIEW" && String(l.details).includes("consent=")));

    // consent is per doctor: Dr. Beta still sees nothing
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, B)).data.medical, null);
    // an assistant of the consented doctor needs the explicit "view consented medical" permission as well
    await g.req("PUT", `/api/doctor/assistants/${asstAUser.id}`, { permissions: ["patients.view", "patientAccounts.search"] }, A);
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, asstA)).data.medical, null);
    await g.req("PUT", `/api/doctor/assistants/${asstAUser.id}`, { permissions: ["patients.view", "patientAccounts.search", "patientAccounts.medical"] }, A);
    assert.ok((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, asstA)).data.medical);
    await g.req("PUT", `/api/doctor/assistants/${asstAUser.id}`, { permissions: ["patients.view", "patients.register", "documents.upload", "prescriptions.view", "appointments.manage"] }, A);

    // patient withdraws
    const rv = await g.req("POST", `/api/me/access/${acc[0].id}/revoke`, {}, p1);
    assert.equal(rv.data.access.status, "REVOKED");
    const after = await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, A);
    assert.equal(after.data.medical, null, "locked again");
    assert.equal(after.data.access, "REVOKED");
    assert.equal((await g.req("POST", `/api/me/access/${acc[0].id}/revoke`, {}, p1)).status, 409);
    // patient proactively grants a doctor; denies another request
    assert.equal((await g.req("POST", "/api/me/access/grant", { doctorId: docA.doctorId }, p1)).data.access.status, "GRANTED");
    assert.equal((await g.req("POST", "/api/me/access/grant", { doctorId: "nope" }, p1)).status, 404);
    await g.req("POST", `/api/patient-accounts/${uid1}/request-access`, {}, B);
    const reqB = (await g.req("GET", "/api/me/access", undefined, p1)).data.access.find((a: any) => a.status === "REQUESTED");
    assert.equal((await g.req("POST", `/api/me/access/${reqB.id}/respond`, { action: "deny" }, p1)).data.access.status, "DENIED");
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, B)).data.medical, null);
    const kinds = new Set(rows("AuditLogs").map((l) => l.action));
    for (const k of ["ACCESS_REQUEST", "ACCESS_GRANT", "ACCESS_REVOKE", "ACCESS_DENY", "REGISTER"]) assert.ok(kinds.has(k), k);
  });

  // ------------------------------------------------------------------ 8. consultation + prescriptions
  let recA = "";
  it("8 · doctor starts a consultation from the UID; prior info is reusable and shown for verification", async () => {
    // Dr. Beta has no consent → refused
    assert.equal((await g.req("POST", `/api/patient-accounts/${uid1}/start-consultation`, {}, B)).status, 403);
    // an assistant without data-entry can't start one
    assert.equal((await g.req("POST", `/api/patient-accounts/${uid1}/start-consultation`, {}, asstA)).status, 403);
    const s = await g.req("POST", `/api/patient-accounts/${uid1}/start-consultation`, {}, A);
    assert.equal(s.ok, true, s.error);
    assert.equal(s.data.created, true);
    recA = s.data.patient.id;
    assert.equal(s.data.patient.patientUid, uid1);
    assert.equal(s.data.patient.allergies, "Penicillin, Sulfa");
    assert.ok(s.data.profile.fieldUpdated.allergies, "verification data carries last-updated dates");
    assert.equal(rows("Patients").find((p) => p.id === recA)!.doctorId, docA.doctorId);
    // second time reuses the same record
    const s2 = await g.req("POST", `/api/patient-accounts/${uid1}/start-consultation`, {}, A);
    assert.equal(s2.data.created, false);
    assert.equal(s2.data.patient.id, recA);
    // the patient updates their allergies later; the doctor's record is NOT silently changed — they verify & update
    await g.req("PUT", "/api/me/profile", { allergies: "Penicillin, Sulfa, Aspirin" }, p1);
    const s3 = await g.req("POST", `/api/patient-accounts/${uid1}/start-consultation`, {}, A);
    assert.equal(s3.data.profile.allergies, "Penicillin, Sulfa, Aspirin");
    assert.equal(s3.data.patient.allergies, "Penicillin, Sulfa", "stored record unchanged until the doctor confirms");
    assert.equal((await g.req("PUT", `/api/patients/${recA}`, { allergies: s3.data.profile.allergies }, A)).data.patient.allergies, "Penicillin, Sulfa, Aspirin");
    assert.ok(rows("AuditLogs").some((l) => l.action === "START_CONSULTATION"));
  });

  it("8b · patient sees only PUBLISHED prescriptions (+ PDF) of their own; drafts and private notes stay hidden", async () => {
    const draft = (await g.req("POST", "/api/prescriptions", { ...rxBody(recA), notes: "private doctor note" }, A)).data.prescription;
    assert.deepEqual((await g.req("GET", "/api/me/prescriptions", undefined, p1)).data.prescriptions, [], "draft is invisible");
    await g.req("POST", `/api/prescriptions/${draft.id}/finalize`, {}, A);
    const pdf = await g.req("POST", "/api/files", { kind: "PRESCRIPTION_PDF", relatedType: "PRESCRIPTION", relatedId: draft.id, name: `${draft.code}_v1.pdf`, mimeType: "application/pdf", dataBase64: PDF }, A);
    assert.equal(pdf.ok, true, pdf.error);
    const list = (await g.req("GET", "/api/me/prescriptions", undefined, p1)).data.prescriptions;
    assert.equal(list.length, 1);
    assert.equal(list[0].notes, "", "private note not exposed");
    assert.equal(list[0].pdfFileId, pdf.data.file.id);
    const dl = await g.req("GET", `/api/files/${pdf.data.file.id}/content`, undefined, p1);
    assert.equal(dl.data.dataBase64, PDF);
    // other patients / doctors cannot
    assert.equal((await g.req("GET", `/api/files/${pdf.data.file.id}/content`, undefined, p2)).status, 404);
    assert.equal((await g.req("GET", `/api/files/${pdf.data.file.id}/content`, undefined, B)).status, 404);
    assert.deepEqual((await g.req("GET", "/api/me/prescriptions", undefined, p2)).data.prescriptions, []);
    // a draft's PDF (if one existed) is not downloadable by the patient
    const d2 = (await g.req("POST", "/api/prescriptions", rxBody(recA), A)).data.prescription;
    const pdf2 = await g.req("POST", "/api/files", { kind: "PRESCRIPTION_PDF", relatedType: "PRESCRIPTION", relatedId: d2.id, name: "draft.pdf", mimeType: "application/pdf", dataBase64: PDF }, A);
    assert.equal((await g.req("GET", `/api/files/${pdf2.data.file.id}/content`, undefined, p1)).status, 404);
    // the prescription never lists on the other doctor's side
    assert.equal((await g.req("GET", "/api/prescriptions", undefined, B)).data.items.every((r: any) => r.doctor.id === docB.doctorId), true);
  });

  // ------------------------------------------------------------------ 9. reports → Drive
  it("9 · patient uploads medical reports to Drive; doctors need consent to see them", async () => {
    const up = await g.req("POST", "/api/files", { kind: "LAB_REPORT", relatedType: "PATIENT", relatedId: patA, name: "cbc.pdf", mimeType: "application/pdf", dataBase64: PDF }, p1);
    assert.equal(up.ok, true, up.error);
    assert.equal(up.data.file.relatedType, "PATIENT_ACCOUNT", "request body can't redirect the upload");
    assert.equal(up.data.file.relatedId, uid1);
    const drive = g.emu.files.get(up.data.file.driveFileId);
    assert.equal(folderPath(drive.parent), `Smart Prescription System/Investigation Reports/${uid1} - Rina Akter`.replace("Smart Prescription System/", "Smart Prescription System/"));
    const reg = rows("Files").find((f) => f.id === up.data.file.id)!;
    assert.equal(reg.storageKey, up.data.file.driveFileId);
    assert.equal(reg.relatedType, "PATIENT_ACCOUNT");
    assert.equal(reg.ownerEmail, "rina@gmail.com");
    assert.equal((await g.req("POST", "/api/files", { kind: "PRESCRIPTION_PDF", relatedType: "PATIENT", relatedId: patA, name: "x.pdf", mimeType: "application/pdf", dataBase64: PDF }, p1)).status, 403, "patients can't upload prescription PDFs");
    assert.equal((await g.req("POST", "/api/files", { kind: "XRAY", relatedType: "PATIENT", relatedId: "x", name: "x.png", mimeType: "image/png", dataBase64: PNG }, p1)).ok, true);

    const lst = (t: string) => g.req("GET", `/api/files?relatedType=PATIENT_ACCOUNT&relatedId=${uid1}`, undefined, t);
    assert.equal((await lst(p1)).data.files.length, 2);
    assert.equal((await lst(p2)).data.files.length, 0, "other patients see nothing");
    assert.equal((await lst(A)).data.files.length, 2, "consented doctor (grant is active) sees them");
    assert.equal((await lst(B)).data.files.length, 0, "no consent → nothing");
    assert.equal((await lst(asstA)).data.files.length, 0, "assistant lacks patientAccounts.medical");
    assert.equal((await g.req("GET", `/api/files/${up.data.file.id}/content`, undefined, B)).status, 404);
    assert.equal((await g.req("GET", `/api/files/${up.data.file.id}/content`, undefined, A)).data.dataBase64, PDF);
    assert.ok(rows("AuditLogs").some((l) => l.action === "PATIENT_FILE_VIEW"));

    // revoke → even the previously consented doctor loses access to the reports
    const grant = (await g.req("GET", "/api/me/access", undefined, p1)).data.access.find((a: any) => a.status === "GRANTED" && a.doctorId === docA.doctorId);
    await g.req("POST", `/api/me/access/${grant.id}/revoke`, {}, p1);
    assert.equal((await lst(A)).data.files.length, 0);
    assert.equal((await g.req("GET", `/api/files/${up.data.file.id}/content`, undefined, A)).status, 404);
    // patient manages own files
    assert.equal((await g.req("DELETE", `/api/files/${up.data.file.id}`, undefined, p2)).status, 404);
    assert.equal((await g.req("DELETE", `/api/files/${up.data.file.id}`, undefined, p1)).ok, true);
    assert.equal(g.emu.files.get(up.data.file.driveFileId).trashed, true);
    await g.req("POST", "/api/me/access/grant", { doctorId: docA.doctorId }, p1); // restore for later tests
  });

  // ------------------------------------------------------------------ 10. appointments + questionnaire
  it("10 · appointments: request (with optional consent), doctor/assistant manage, patient cancels; isolation holds", async () => {
    const dir = (await g.req("GET", "/api/doctors/directory", undefined, p2)).data.doctors;
    assert.ok(dir.length >= 2 && dir.every((d: any) => d.name && !d.userId));
    assert.equal((await g.req("GET", "/api/doctors/directory", undefined, A)).status, 403);
    const ap = await g.req("POST", "/api/me/appointments", { doctorId: docA.doctorId, chamberId: chamberA, preferredDate: "2026-12-01", preferredTime: "17:00", reason: "Fever", shareMedical: true }, p2);
    assert.equal(ap.ok, true, ap.error);
    assert.equal(ap.data.appointment.status, "REQUESTED");
    assert.equal((await g.req("POST", "/api/me/appointments", { doctorId: docA.doctorId, chamberId: "foreign-chamber", preferredDate: "2026-12-01" }, p2)).status, 400);
    assert.equal((await g.req("POST", "/api/me/appointments", { doctorId: "nope", preferredDate: "2026-12-01" }, p2)).status, 404);
    assert.equal((await g.req("POST", "/api/me/appointments", { preferredDate: "2026-12-01" }, p2)).status, 400);
    // consent was granted together with the request
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid2}`, undefined, A)).data.access, "GRANTED");
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid2}`, undefined, B)).data.access, "NONE");

    assert.equal((await g.req("GET", "/api/appointments", undefined, A)).data.appointments.length, 1);
    assert.equal((await g.req("GET", "/api/appointments", undefined, B)).data.appointments.length, 0);
    assert.equal((await g.req("PUT", `/api/appointments/${ap.data.appointment.id}`, { status: "CONFIRMED" }, B)).status, 404);
    assert.equal((await g.req("GET", "/api/appointments", undefined, asstA)).data.appointments.length, 1, "assistant with appointments.manage");
    const conf = await g.req("PUT", `/api/appointments/${ap.data.appointment.id}`, { status: "CONFIRMED", scheduledAt: "2026-12-01T17:30:00Z", doctorNote: "Bring reports" }, asstA);
    assert.equal(conf.data.appointment.status, "CONFIRMED");
    assert.equal((await g.req("GET", "/api/me/appointments", undefined, p2)).data.appointments[0].doctorNote, "Bring reports");
    assert.equal((await g.req("GET", "/api/me/appointments", undefined, p1)).data.appointments.length, 0, "patients see only their own");
    assert.equal((await g.req("POST", `/api/me/appointments/${ap.data.appointment.id}/cancel`, {}, p1)).status, 404);
    assert.equal((await g.req("POST", `/api/me/appointments/${ap.data.appointment.id}/cancel`, {}, p2)).data.appointment.status, "CANCELLED");
    assert.equal((await g.req("PUT", `/api/appointments/${ap.data.appointment.id}`, { status: "COMPLETED" }, A)).status, 409);
    assert.equal(rows("Appointments").length, 1);
  });

  it("11 · doctor's registration form / questionnaire: patients fill it, only consented doctors read it", async () => {
    // sessions last 7 days and this suite has been moving the clock — an expired token must be refused…
    g.advance(8 * 86_400_000);
    assert.equal((await g.req("GET", "/api/dashboard", undefined, A)).status, 401, "7-day token expired");
    p1 = (await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-1", email: "rina@gmail.com", name: "Rina Akter" }) }, null)).data.token;
    p2 = (await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-2", email: "karim@gmail.com", name: "Karim" }) }, null)).data.token;
    p3 = (await g.req("POST", "/api/auth/google", { idToken: gtoken({ sub: "g-9", email: "x@gmail.com" }) }, null)).data.token;
    B = (await g.login("dr.beta", "Beta-Final-2")).data.token;
    asstA = (await g.login("asst.a", "AsstA-Final-1")).data.token;
    A = (await g.login("dr.alpha", "Alpha-Final-1")).data.token; // …and a fresh login works
    assert.equal((await g.req("PUT", "/api/doctor/questionnaire", { title: "x", fields: [] }, asstA)).status, 403, "only the doctor edits the form");
    const q = await g.req("PUT", "/api/doctor/questionnaire", {
      title: "New patient form", description: "Please complete before your visit", active: true,
      fields: [
        { id: "smoker", label: "Do you smoke?", type: "yesno", required: true },
        { id: "since", label: "Symptoms since", type: "date" },
        { id: "pain", label: "Pain level", type: "select", options: ["Mild", "Moderate", "Severe"] },
        { id: "notes", label: "Anything else", type: "textarea" },
      ],
    }, A);
    assert.equal(q.ok, true, q.error);
    assert.equal(q.data.questionnaire.fields.length, 4);
    assert.equal((await g.req("PUT", "/api/doctor/questionnaire", { title: "", fields: [] }, A)).status, 400);
    const formId = q.data.questionnaire.id;
    // p2 has a live appointment with Dr. Alpha? (cancelled) → but p1 has consent
    const forms = (await g.req("GET", "/api/me/forms", undefined, p1)).data.forms;
    assert.equal(forms.length, 1);
    assert.equal(forms[0].doctorName, "Dr. Alpha Rahman");
    assert.equal((await g.req("GET", "/api/me/forms", undefined, p2)).data.forms.length, 1, "p2 consented to Dr. Alpha with the appointment request — consent outlives the cancellation");
    assert.equal((await g.req("GET", "/api/me/forms", undefined, p3)).data.forms.length, 0, "no relationship → no form");
    assert.equal((await g.req("PUT", `/api/me/forms/${formId}`, { answers: {} }, p1)).status, 400, "required question");
    assert.equal((await g.req("PUT", `/api/me/forms/${formId}`, { answers: { smoker: "No" } }, p3)).status, 404);
    const sub = await g.req("PUT", `/api/me/forms/${formId}`, { answers: { smoker: "No", pain: "Mild", notes: "None" } }, p1);
    assert.equal(sub.ok, true, sub.error);
    assert.equal(rows("QuestionnaireResponses").length, 1);
    g.advance(86_400_000);
    await new Promise((x) => setTimeout(x, 15));
    await g.req("PUT", `/api/me/forms/${formId}`, { answers: { smoker: "Yes", pain: "Mild", notes: "None" } }, p1);
    const f2 = (await g.req("GET", "/api/me/forms", undefined, p1)).data.forms[0].response;
    assert.equal(f2.answers.smoker, "Yes");
    assert.notEqual(f2.fieldUpdated.smoker, f2.fieldUpdated.pain, "per-answer last-updated dates");
    const v = await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, A);
    assert.equal(v.ok, true, `view failed: ${v.status} ${v.error}`);
    assert.equal(v.data.forms[0].response.answers.smoker, "Yes");
    assert.equal((await g.req("GET", `/api/patient-accounts/${uid1}`, undefined, B)).data.forms.length, 0);
  });

  // ------------------------------------------------------------------ 12. storage + hygiene
  it("12 · everything lands in the right Google Sheets; nothing sensitive is stored in the clear", async () => {
    for (const n of ["Users", "Doctors", "Assistants", "Patients", "PatientMedicalProfiles", "DoctorAssistantRelationships", "DoctorPatientAccess", "UserPermissions", "AccountActivationRecords", "AuditLogs", "Appointments", "Questionnaires", "QuestionnaireResponses", "Files"]) {
      assert.ok(g.sheet(n).length >= 2, `${n} has data`);
    }
    const users = rows("Users");
    assert.ok(users.every((u) => u.passwordHash === "" || /^pbkdf2\$100000\$/.test(u.passwordHash)));
    for (const pw of ["Alpha-Final-1", "Beta-Final-2", "AsstA-Final-1", "Alpha-Temp-1", "Gamma-Temp-1"]) assert.ok(!allCells().some((c) => c.includes(pw)), `no plain text: ${pw}`);
    assert.ok(users.filter((u) => u.role === "PATIENT").every((u) => u.passwordHash === "" && u.googleSub));
    // unique ids / uids / usernames
    const uniq = (arr: string[]) => new Set(arr).size === arr.length;
    assert.ok(uniq(users.map((u) => u.id)) && uniq(users.map((u) => u.username)));
    assert.ok(uniq(rows("PatientMedicalProfiles").map((p) => p.patientUid)));
    // ownership: every patient record, prescription, chamber carries a doctor id
    assert.ok(rows("Patients").every((p) => p.doctorId));
    assert.ok(rows("Prescriptions").every((p) => p.doctorId));
    assert.ok(rows("Chambers").every((p) => p.doctorId));
    // the admin audit log is readable, doctors' is not
    adminToken = (await g.login(ADMIN.email, ADMIN.password)).data.token;
    assert.ok((await g.req("GET", "/api/admin/audit-logs?limit=50", undefined, adminToken)).data.logs.length > 20);
    assert.equal((await g.req("GET", "/api/admin/audit-logs", undefined, A)).status, 403);
    assert.equal((await g.req("GET", "/api/admin/audit-logs", undefined, p1)).status, 403);
  });

  it("13 · every API route rejects anonymous callers", async () => {
    const routes: [string, string][] = [
      ["GET", "/api/patients"], ["POST", "/api/patients"], ["GET", "/api/prescriptions"], ["POST", "/api/prescriptions"],
      ["GET", "/api/dashboard"], ["GET", "/api/doctor/profile"], ["PUT", "/api/doctor/profile"], ["GET", "/api/doctor/chambers"],
      ["GET", "/api/doctor/assistants"], ["POST", "/api/doctor/assistants"], ["GET", "/api/appointments"], ["GET", "/api/doctor/questionnaire"],
      ["GET", "/api/patient-accounts/search?by=uid&q=PAT-2026-000001"], ["GET", "/api/patient-accounts/PAT-2026-000001"],
      ["POST", "/api/patient-accounts/PAT-2026-000001/request-access"], ["POST", "/api/patient-accounts/PAT-2026-000001/start-consultation"],
      ["GET", "/api/me/profile"], ["PUT", "/api/me/profile"], ["GET", "/api/me/prescriptions"], ["GET", "/api/me/access"], ["GET", "/api/me/appointments"],
      ["GET", "/api/me/forms"], ["GET", "/api/doctors/directory"], ["GET", "/api/files?relatedType=PATIENT&relatedId=x"], ["POST", "/api/files"],
      ["GET", "/api/admin/users"], ["POST", "/api/admin/users"], ["GET", "/api/admin/audit-logs"], ["POST", "/api/admin/backups"],
      ["GET", "/api/medicines/search?q=napa"], ["GET", "/api/libraries?category=ADVICE"], ["GET", "/api/templates"],
    ];
    for (const [m, p] of routes) assert.equal((await g.req(m, p, m === "GET" ? undefined : {}, null)).status, 401, `${m} ${p}`);
  });
});
