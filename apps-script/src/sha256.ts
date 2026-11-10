// Pure-JS SHA-256 / HMAC / PBKDF2 (Apps Script has no crypto.subtle and its
// Utilities.computeHmacSha256Signature is far too slow for 100k PBKDF2 rounds).
// Output is byte-identical to Web Crypto / Node (verified in tests/gas.test.ts).

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);

/** One compression round: state (8 words) updated in place from a 64-byte block at `off`. */
function compress(state: Uint32Array, block: Uint8Array, off: number) {
  for (let i = 0; i < 16; i++) {
    const j = off + i * 4;
    W[i] = (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let a = state[0], b = state[1], c = state[2], d = state[3];
  let e = state[4], f = state[5], g = state[6], h = state[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0;
}

function stateToBytes(state: Uint32Array, out: Uint8Array) {
  for (let i = 0; i < 8; i++) {
    out[i * 4] = state[i] >>> 24;
    out[i * 4 + 1] = state[i] >>> 16;
    out[i * 4 + 2] = state[i] >>> 8;
    out[i * 4 + 3] = state[i];
  }
}

export function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const total = (((len + 9 + 63) >> 6) << 6);
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  buf[total - 4] = bits >>> 24;
  buf[total - 3] = bits >>> 16;
  buf[total - 2] = bits >>> 8;
  buf[total - 1] = bits;
  const state = new Uint32Array(IV);
  for (let off = 0; off < total; off += 64) compress(state, buf, off);
  const out = new Uint8Array(32);
  stateToBytes(state, out);
  return out;
}

/** HMAC with pre-computed pad states so PBKDF2 rounds cost exactly 2 compressions each. */
class Hmac {
  private inner = new Uint32Array(8);
  private outer = new Uint32Array(8);
  constructor(key: Uint8Array) {
    let k = key;
    if (k.length > 64) k = sha256(k);
    const ipad = new Uint8Array(64);
    const opad = new Uint8Array(64);
    ipad.set(k);
    opad.set(k);
    for (let i = 0; i < 64; i++) {
      ipad[i] ^= 0x36;
      opad[i] ^= 0x5c;
    }
    this.inner.set(IV);
    this.outer.set(IV);
    compress(this.inner, ipad, 0);
    compress(this.outer, opad, 0);
  }
  /** HMAC of an arbitrary-length message. */
  mac(msg: Uint8Array): Uint8Array {
    const len = msg.length;
    const total = (((len + 9 + 63) >> 6) << 6);
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[len] = 0x80;
    const bits = (len + 64) * 8;
    buf[total - 4] = bits >>> 24;
    buf[total - 3] = bits >>> 16;
    buf[total - 2] = bits >>> 8;
    buf[total - 1] = bits;
    const st = new Uint32Array(this.inner);
    for (let off = 0; off < total; off += 64) compress(st, buf, off);
    const innerHash = new Uint8Array(32);
    stateToBytes(st, innerHash);
    return this.finish(innerHash);
  }
  /** HMAC of a 32-byte message (the PBKDF2 inner loop) — no allocation beyond `block`. */
  private block = new Uint8Array(64);
  finish(innerHash: Uint8Array): Uint8Array {
    const b = this.block;
    b.set(innerHash);
    b[32] = 0x80;
    for (let i = 33; i < 62; i++) b[i] = 0;
    b[62] = 0x03; // (64 + 32) * 8 = 768 = 0x0300
    b[63] = 0x00;
    b[62] = 0x03;
    const st = new Uint32Array(this.outer);
    compress(st, b, 0);
    const out = new Uint8Array(32);
    stateToBytes(st, out);
    return out;
  }
  mac32(msg32: Uint8Array): Uint8Array {
    const b = this.block;
    b.set(msg32);
    b[32] = 0x80;
    for (let i = 33; i < 62; i++) b[i] = 0;
    b[62] = 0x03;
    b[63] = 0x00;
    const st = new Uint32Array(this.inner);
    compress(st, b, 0);
    const innerHash = new Uint8Array(32);
    stateToBytes(st, innerHash);
    return this.finish(innerHash);
  }
}

export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return new Hmac(key).mac(msg);
}

/** PBKDF2-HMAC-SHA256, 32-byte output (one block). */
export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  const h = new Hmac(password);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[salt.length + 3] = 1;
  let u = h.mac(first);
  const t = new Uint8Array(u);
  for (let i = 1; i < iterations; i++) {
    u = h.mac32(u);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}

export function utf8(s: string): Uint8Array {
  // manual UTF-8 (TextEncoder does not exist in Apps Script)
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function toHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return s;
}

export function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export function base64url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < b.length) s += B64[(n >> 6) & 63];
    if (i + 2 < b.length) s += B64[n & 63];
  }
  return s;
}
export function base64urlDecode(s: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}
