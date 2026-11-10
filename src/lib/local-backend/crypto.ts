// Password hashing for the in-browser backend (Web Crypto PBKDF2-SHA256).
// Replaces the server-side scrypt used by the original Node API.

const ITERATIONS = 120_000;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256
  );
  return toHex(bits);
}

async function webHashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${hash}`;
}

async function webVerifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iter, salt, hash] = stored.split("$");
    if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
    const test = await derive(password, fromHex(salt), Number(iter));
    // constant-time-ish comparison
    if (test.length !== hash.length) return false;
    let diff = 0;
    for (let i = 0; i < test.length; i++) diff |= test.charCodeAt(i) ^ hash.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}


/**
 * Pluggable crypto. The browser build uses Web Crypto (above). The Google Apps
 * Script build installs a synchronous pure-JS provider (Apps Script has neither
 * crypto.subtle nor crypto.randomUUID) — see apps-script/src/platform.ts.
 */
export interface CryptoProvider {
  hashPassword(password: string): Promise<string> | string;
  verifyPassword(password: string, stored: string): Promise<boolean> | boolean;
  uuid(): string;
  randomHex(bytes: number): string;
}

const webProvider: CryptoProvider = {
  hashPassword: webHashPassword,
  verifyPassword: webVerifyPassword,
  uuid: () => crypto.randomUUID(),
  randomHex: (n) => toHex(crypto.getRandomValues(new Uint8Array(n))),
};

let provider: CryptoProvider = webProvider;

export function setCryptoProvider(p: CryptoProvider) {
  provider = p;
}

export async function hashPassword(password: string): Promise<string> {
  return provider.hashPassword(password);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  return provider.verifyPassword(password, stored);
}

export function newId(): string {
  return provider.uuid().replace(/-/g, "").slice(0, 25);
}

export function newToken(): string {
  return provider.randomHex(32);
}
