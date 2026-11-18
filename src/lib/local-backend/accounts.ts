// Accounts: login (username / e-mail / Google), forced first-login password change, Super-Admin
// user management, doctor-owned assistants. Every rule here is enforced server-side.

import { DEFAULT_ASSISTANT_PERMISSIONS, ASSISTANT_PERMISSION_KEYS, passwordProblem } from "@/lib/permissions";
import { hashPassword, newId, verifyPassword } from "./crypto";
import {
  HttpError,
  accountUsable,
  audit,
  createSession,
  destroySession,
  generateDoctorCode,
  generatePatientUid,
  getSessionUser,
  permissionsOf,
  requireRole,
  requireUser,
  sessionUserFromRow,
  toUserDTO,
  usernameTaken,
} from "./core";
import { runtime } from "./runtime";
import { tables, touch, type AssistantRow, type DoctorRow, type UserRow } from "./store";
import type { Handler } from "./handlers";
import {
  changePasswordSchema,
  createAssistantSchema,
  createUserSchema,
  googleLoginSchema,
  loginSchema,
  updateAssistantSchema,
  updateUserSchema,
} from "./schemas";

const now = () => new Date().toISOString();
const TEMP_PASSWORD_HOURS = 72;

function activation(userId: string, type: string, byUserId: string, detail = "", expiresAt: string | null = null) {
  tables.activationRecords.push({ id: newId(), userId, type, byUserId, detail, expiresAt, createdAt: now() });
  touch("activationRecords");
}

/** Set a one-time temporary password: the account must replace it at first login. */
async function issueTempPassword(user: UserRow, tempPassword: string, byUserId: string) {
  const problem = passwordProblem(tempPassword, { username: user.username });
  if (problem) throw new HttpError(400, `tempPassword: ${problem}`);
  user.passwordHash = await hashPassword(tempPassword);
  user.mustChangePassword = true;
  user.tempPasswordUsed = false;
  user.tempPasswordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_HOURS * 3_600_000).toISOString();
  user.updatedAt = now();
  touch("users");
  activation(user.id, "TEMP_PASSWORD_ISSUED", byUserId, "", user.tempPasswordExpiresAt);
}

function setStatus(user: UserRow, status: UserRow["status"], byUserId: string) {
  if (user.status === status) return;
  const old = user.status;
  user.status = status;
  user.active = status === "ACTIVE";
  user.updatedAt = now();
  touch("users");
  activation(user.id, "STATUS_CHANGED", byUserId, `${old} → ${status}`);
}

function assertUnique(username: string, email: string, exceptUserId?: string) {
  if (usernameTaken(username, exceptUserId)) throw new HttpError(409, "This username is already taken");
  if (email && tables.users.some((u) => u.email && u.email.toLowerCase() === email && u.id !== exceptUserId)) {
    throw new HttpError(409, "A user with this email already exists");
  }
}

function newUserRow(p: Pick<UserRow, "username" | "name" | "role" | "email" | "phone" | "status"> & Partial<UserRow>): UserRow {
  const t = now();
  return {
    id: newId(),
    passwordHash: "",
    active: p.status === "ACTIVE",
    createdAt: t,
    updatedAt: t,
    mustChangePassword: false,
    tempPasswordExpiresAt: null,
    tempPasswordUsed: false,
    doctorId: null,
    googleSub: null,
    patientUid: null,
    lastLoginAt: null,
    ...p,
  };
}

export function blankDoctor(userId: string, name: string, email: string, phone: string): DoctorRow {
  const t = now();
  return {
    id: newId(),
    code: generateDoctorCode(),
    userId,
    fullName: name,
    professionalTitle: "",
    specialization: "",
    bmdcNo: "",
    designation: "",
    hospitalName: "",
    chamberAddress: "",
    phone,
    email,
    photoUrl: "",
    signatureUrl: "",
    logoUrl: "",
    consultationSchedule: "",
    headerNote: "",
    footerNote: "",
    activeTemplate: "modern",
    themeColor: "teal",
    fontFamily: "mixed",
    headerLayout: "center",
    showLogo: true,
    showPhoto: false,
    createdAt: t,
    updatedAt: t,
  };
}

// ---------------------------------------------------------------------------
// login / session
// ---------------------------------------------------------------------------

export const login: Handler = async ({ body }) => {
  const parsed = loginSchema.parse(body);
  const ident = (parsed.identifier ?? parsed.email ?? "").trim().toLowerCase();
  runtime.throttle.assertAllowed(ident);
  const user = tables.users.find(
    (u) => u.username.toLowerCase() === ident || (u.email !== "" && u.email.toLowerCase() === ident)
  );
  // patients have no password (Google only) → the hash is empty and verification fails
  const ok = !!user && user.passwordHash !== "" && (await verifyPassword(parsed.password, user.passwordHash));
  if (!user || !ok) {
    runtime.throttle.recordFailure(ident);
    throw new HttpError(401, "Invalid username or password");
  }
  if (user.status === "SUSPENDED") throw new HttpError(403, "This account is suspended — contact your administrator");
  if (user.status === "DEACTIVATED" || !user.active) throw new HttpError(403, "This account has been deactivated");
  if (!accountUsable(user)) throw new HttpError(403, "This account is not active — contact your doctor / administrator");

  if (user.mustChangePassword) {
    if (user.tempPasswordExpiresAt && new Date(user.tempPasswordExpiresAt).getTime() < Date.now()) {
      throw new HttpError(403, "Your temporary password has expired — ask for a new one");
    }
    if (user.tempPasswordUsed) {
      throw new HttpError(403, "This temporary password has already been used — ask for a new one");
    }
    user.tempPasswordUsed = true; // one-time: consumed by the first login
    activation(user.id, "TEMP_PASSWORD_USED", user.id);
  }
  runtime.throttle.clear(ident);
  user.lastLoginAt = now();
  touch("users");
  const token = createSession(user.id);
  const sessionUser = sessionUserFromRow(user);
  audit(sessionUser, "LOGIN", "USER", user.id);
  return { user: sessionUser, token };
};

export const googleLogin: Handler = async ({ body }) => {
  const { idToken } = googleLoginSchema.parse(body);
  const g = runtime.verifyGoogleIdToken(idToken);
  if (!g.emailVerified) throw new HttpError(403, "Your Google email address is not verified");
  const email = g.email.trim().toLowerCase();

  let user = tables.users.find((u) => u.googleSub === g.sub) ?? tables.users.find((u) => u.role === "PATIENT" && u.email.toLowerCase() === email);
  let isNew = false;
  if (!user) {
    if (tables.users.some((u) => u.email && u.email.toLowerCase() === email)) {
      throw new HttpError(403, "This email belongs to a staff account — staff sign in with their username and password");
    }
    const patientUid = generatePatientUid();
    const t = now();
    user = newUserRow({
      username: patientUid.toLowerCase(),
      name: g.name || email.split("@")[0],
      role: "PATIENT",
      email,
      phone: "",
      status: "ACTIVE",
      googleSub: g.sub,
      patientUid,
    });
    tables.users.push(user);
    tables.patientProfiles.push({
      id: newId(), patientUid, userId: user.id, fullName: user.name, dob: null, ageYears: null, gender: "", mobile: "",
      email, address: "", weight: null, height: null, bloodGroup: "", allergies: "", conditions: "", history: "",
      medications: "", surgeries: "", familyHistory: "", other: "", customFields: "[]",
      fieldUpdated: JSON.stringify({ fullName: t, email: t }), createdAt: t, updatedAt: t,
    });
    touch("users", "patientProfiles");
    activation(user.id, "PATIENT_REGISTERED", user.id, `google:${g.sub}`);
    isNew = true;
  } else {
    if (user.status !== "ACTIVE") throw new HttpError(403, "This account is not active — contact the clinic administrator");
    if (!user.googleSub) user.googleSub = g.sub;
  }
  user.lastLoginAt = now();
  touch("users");
  const token = createSession(user.id);
  const sessionUser = sessionUserFromRow(user);
  audit(sessionUser, isNew ? "REGISTER" : "LOGIN", "USER", user.id, `patient ${user.patientUid}`);
  return { user: sessionUser, token, isNew };
};

export const logout: Handler = () => {
  destroySession();
  return { ok: true };
};

export const me: Handler = () => ({ user: getSessionUser() });

export const changePassword: Handler = async ({ body }) => {
  const sessionUser = requireUser({ allowPasswordChange: true });
  const parsed = changePasswordSchema.parse(body);
  const row = tables.users.find((u) => u.id === sessionUser.id);
  if (!row || row.passwordHash === "") throw new HttpError(400, "This account signs in with Google and has no password");
  if (!(await verifyPassword(parsed.currentPassword, row.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect");
  }
  if (parsed.newPassword === parsed.currentPassword) {
    throw new HttpError(400, "The new password must be different from the current one");
  }
  const problem = passwordProblem(parsed.newPassword, { username: row.username, email: row.email });
  if (problem) throw new HttpError(400, `newPassword: ${problem}`);

  const wasTemp = row.mustChangePassword;
  row.passwordHash = await hashPassword(parsed.newPassword);
  row.mustChangePassword = false;
  row.tempPasswordUsed = false;
  row.tempPasswordExpiresAt = null; // the old temporary password can never work again: the hash was replaced
  row.updatedAt = now();
  touch("users");
  activation(row.id, wasTemp ? "FIRST_PASSWORD_SET" : "PASSWORD_CHANGED", row.id);
  audit(sessionUser, "UPDATE", "USER", row.id, wasTemp ? "Replaced temporary password" : "Changed own password");
  // tokens are tied to the old hash → hand back a fresh one
  const token = createSession(row.id);
  return { ok: true, token, user: sessionUserFromRow(row) };
};

// ---------------------------------------------------------------------------
// Super Admin → users (doctors / super admins)
// ---------------------------------------------------------------------------

export const listUsers: Handler = () => {
  requireRole("SUPER_ADMIN");
  const users = [...tables.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { users: users.map(toUserDTO) };
};

export const createUser: Handler = async ({ body }) => {
  const admin = requireRole("SUPER_ADMIN");
  const p = createUserSchema.parse(body);
  if (p.role === "DOCTOR" && runtime.config.requireDoctorEmail() && !p.email) {
    throw new HttpError(400, "email: Email address is required for doctors");
  }
  assertUnique(p.username, p.email);
  const user = newUserRow({ username: p.username, name: p.name, role: p.role, email: p.email, phone: p.phone, status: p.status });
  await issueTempPassword(user, p.tempPassword, admin.id);
  tables.users.push(user);
  touch("users");
  if (p.role === "DOCTOR") {
    tables.doctors.push(blankDoctor(user.id, p.name, p.email, p.phone));
    touch("doctors");
  }
  activation(user.id, "ACCOUNT_CREATED", admin.id, `${p.role} ${p.username}`);
  audit(admin, "CREATE", "USER", user.id, `${user.username} (${user.role})`);
  return { user: toUserDTO(user), tempPasswordExpiresAt: user.tempPasswordExpiresAt };
};

export const updateUser: Handler = async ({ params, body }) => {
  const admin = requireRole("SUPER_ADMIN");
  const p = updateUserSchema.parse(body);
  const user = tables.users.find((u) => u.id === params.id);
  if (!user) throw new HttpError(404, "User not found");
  if (p.status && p.status !== "ACTIVE" && user.id === admin.id) throw new HttpError(400, "You cannot suspend or deactivate your own account");
  if (user.role === "PATIENT" && (p.tempPassword || p.email !== undefined || p.name !== undefined)) {
    throw new HttpError(400, "Patient accounts are managed by the patient — only their status can be changed");
  }
  if (p.email !== undefined && p.email) assertUnique(user.username, p.email, user.id);
  const changed: string[] = [];
  if (p.name !== undefined) { user.name = p.name; changed.push("name"); }
  if (p.email !== undefined) { user.email = p.email; changed.push("email"); }
  if (p.phone !== undefined) { user.phone = p.phone; changed.push("phone"); }
  if (p.status !== undefined) { setStatus(user, p.status, admin.id); changed.push(`status=${p.status}`); }
  if (p.tempPassword !== undefined) { await issueTempPassword(user, p.tempPassword, admin.id); changed.push("temporary password re-issued"); }
  user.updatedAt = now();
  touch("users");
  audit(admin, "UPDATE", "USER", user.id, `${user.username}: ${changed.join(", ")}`);
  return { user: toUserDTO(user) };
};

// ---------------------------------------------------------------------------
// Doctor → own assistants
// ---------------------------------------------------------------------------

export interface AssistantDTO {
  id: string; // user id
  name: string;
  username: string;
  email: string;
  phone: string;
  status: UserRow["status"];
  permissions: string[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function toAssistantDTO(u: UserRow): AssistantDTO {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    phone: u.phone,
    status: u.status,
    permissions: permissionsOf(u.id),
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/** Only the doctor's OWN assistants — another doctor's assistant id is indistinguishable from "not found". */
function ownAssistant(doctorId: string, userId: string): UserRow {
  const u = tables.users.find((x) => x.id === userId && x.role === "ASSISTANT" && x.doctorId === doctorId);
  if (!u) throw new HttpError(404, "Assistant not found");
  return u;
}

function setPermissions(userId: string, keys: string[], byUserId: string) {
  const wanted = new Set(keys.filter((k) => ASSISTANT_PERMISSION_KEYS.includes(k))); // finalize/sign can never be granted
  const t = now();
  for (const key of ASSISTANT_PERMISSION_KEYS) {
    const row = tables.userPermissions.find((p) => p.userId === userId && p.permission === key);
    if (row) {
      if (row.allowed !== wanted.has(key)) {
        row.allowed = wanted.has(key);
        row.updatedById = byUserId;
        row.updatedAt = t;
      }
    } else {
      tables.userPermissions.push({ id: newId(), userId, permission: key, allowed: wanted.has(key), updatedById: byUserId, updatedAt: t });
    }
  }
  touch("userPermissions");
}

export const listAssistants: Handler = () => {
  const doc = requireRole("DOCTOR");
  const users = tables.users.filter((u) => u.role === "ASSISTANT" && u.doctorId === doc.doctorId);
  return { assistants: users.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toAssistantDTO) };
};

export const createAssistant: Handler = async ({ body }) => {
  const doc = requireRole("DOCTOR");
  const p = createAssistantSchema.parse(body);
  assertUnique(p.username, p.email);
  const user = newUserRow({ username: p.username, name: p.name, role: "ASSISTANT", email: p.email, phone: p.phone, status: p.status, doctorId: doc.doctorId! });
  await issueTempPassword(user, p.tempPassword, doc.id);
  tables.users.push(user);
  const t = now();
  const a: AssistantRow = { id: newId(), userId: user.id, doctorId: doc.doctorId!, name: p.name, phone: p.phone, email: p.email, createdAt: t, updatedAt: t };
  tables.assistants.push(a);
  tables.relationships.push({ id: newId(), doctorId: doc.doctorId!, assistantId: a.id, userId: user.id, status: "ACTIVE", createdById: doc.id, createdAt: t, endedAt: null });
  setPermissions(user.id, p.permissions ?? DEFAULT_ASSISTANT_PERMISSIONS, doc.id);
  touch("users", "assistants", "relationships");
  activation(user.id, "ACCOUNT_CREATED", doc.id, `ASSISTANT ${p.username} for doctor ${doc.doctorId}`);
  audit(doc, "CREATE", "USER", user.id, `assistant ${user.username}`);
  return { assistant: toAssistantDTO(user), tempPasswordExpiresAt: user.tempPasswordExpiresAt };
};

export const updateAssistant: Handler = async ({ params, body }) => {
  const doc = requireRole("DOCTOR");
  const user = ownAssistant(doc.doctorId!, params.id);
  const p = updateAssistantSchema.parse(body);
  if (p.email) assertUnique(user.username, p.email, user.id);
  const changed: string[] = [];
  if (p.name !== undefined) { user.name = p.name; changed.push("name"); }
  if (p.email !== undefined) { user.email = p.email; changed.push("email"); }
  if (p.phone !== undefined) { user.phone = p.phone; changed.push("phone"); }
  const a = tables.assistants.find((x) => x.userId === user.id);
  if (a) {
    if (p.name !== undefined) a.name = p.name;
    if (p.email !== undefined) a.email = p.email;
    if (p.phone !== undefined) a.phone = p.phone;
    a.updatedAt = now();
    touch("assistants");
  }
  if (p.status !== undefined) { setStatus(user, p.status, doc.id); changed.push(`status=${p.status}`); }
  if (p.permissions !== undefined) { setPermissions(user.id, p.permissions, doc.id); changed.push("permissions"); }
  if (p.tempPassword !== undefined) { await issueTempPassword(user, p.tempPassword, doc.id); changed.push("temporary password re-issued"); }
  user.updatedAt = now();
  touch("users");
  audit(doc, "UPDATE", "USER", user.id, `assistant ${user.username}: ${changed.join(", ")}`);
  return { assistant: toAssistantDTO(user) };
};

export const removeAssistant: Handler = ({ params }) => {
  const doc = requireRole("DOCTOR");
  const user = ownAssistant(doc.doctorId!, params.id);
  setStatus(user, "DEACTIVATED", doc.id);
  const rel = tables.relationships.find((r) => r.userId === user.id && r.doctorId === doc.doctorId && r.status === "ACTIVE");
  if (rel) {
    rel.status = "ENDED";
    rel.endedAt = now();
    touch("relationships");
  }
  audit(doc, "DELETE", "USER", user.id, `assistant ${user.username} removed (account kept, deactivated)`);
  return { ok: true };
};
