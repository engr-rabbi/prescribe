// A faithful-enough in-memory emulation of the Google Apps Script services used by the
// backend (SpreadsheetApp, DriveApp, CacheService, PropertiesService, LockService,
// Utilities, ContentService, UrlFetchApp, ScriptApp). It exists so the REAL bundled
// Code.js can be exercised end-to-end in CI. It is NOT Google — passing these tests proves
// the logic, not the Google integration (see docs/GOOGLE-SETUP.md "Verify against real Google").
//
// Deliberately strict where Google is strict:
//  • ranges outside the sheet's dimensions throw
//  • non-text-formatted cells auto-convert numeric / ISO-date strings (like real Sheets)
//  • CacheService values over 100 kB throw
//  • a second waitLock while held throws
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

type Cell = string | number | boolean | Date | "";

let seq = 0;
const nid = (p: string) => `${p}${(++seq).toString(36).padStart(6, "0")}${randomUUID().slice(0, 6)}`;

export interface EmuStats {
  sheetReads: number;
  sheetWrites: number;
  lockWaits: number;
  driveCreates: number;
}

export class Emulator {
  stats: EmuStats = { sheetReads: 0, sheetWrites: 0, lockWaits: 0, driveCreates: 0 };
  props = new Map<string, string>();
  triggers: { fn: string }[] = [];
  now = Date.now();
  folders = new Map<string, any>();
  files = new Map<string, any>();
  spreadsheets = new Map<string, any>();
  cache = new Map<string, { v: string; exp: number }>();
  lockHeld = false;
  fetchRoot: string;
  fetchBase = "https://seed.test/data";
  private DateCtor: DateConstructor = Date;
  rootDriveFolder: any;

  constructor(fetchRoot: string) {
    this.fetchRoot = fetchRoot;
    this.rootDriveFolder = this.newFolder("My Drive", null);
  }

  setDateCtor(d: DateConstructor) {
    this.DateCtor = d;
  }

  // ---------- Drive ----------
  newFolder(name: string, parent: string | null) {
    const f = { id: nid("fld"), name, parent, trashed: false };
    this.folders.set(f.id, f);
    return f;
  }

  private folderApi(f: any): any {
    const self = this;
    return {
      getId: () => f.id,
      getName: () => f.name,
      isTrashed: () => f.trashed,
      getUrl: () => `https://drive.google.com/drive/folders/${f.id}`,
      createFolder: (name: string) => self.folderApi(self.newFolder(name, f.id)),
      getFoldersByName(name: string) {
        const list = [...self.folders.values()].filter((x) => x.parent === f.id && x.name === name && !x.trashed);
        let i = 0;
        return { hasNext: () => i < list.length, next: () => self.folderApi(list[i++]) };
      },
      createFile(blob: any) {
        self.stats.driveCreates++;
        const file = { id: nid("fil"), name: blob.getName(), mime: blob.getContentType(), bytes: Buffer.from(blob.getBytes().map((b: number) => b & 255)), parent: f.id, trashed: false, description: "", sheetId: null as string | null };
        self.files.set(file.id, file);
        return self.fileApi(file);
      },
    };
  }

  fileApi(file: any): any {
    const self = this;
    return {
      getId: () => file.id,
      getName: () => file.name,
      getMimeType: () => file.mime,
      isTrashed: () => file.trashed,
      setTrashed(v: boolean) {
        file.trashed = v;
        return this;
      },
      setDescription(d: string) {
        file.description = d;
        return this;
      },
      getBlob: () => self.blob([...file.bytes].map((b) => (b > 127 ? b - 256 : b)), file.mime, file.name),
      getSize: () => file.bytes.length,
      moveTo(folder: any) {
        file.parent = folder.getId();
        return this;
      },
      makeCopy(name: string, folder: any) {
        const copy = { ...file, id: nid("fil"), name, parent: folder.getId(), trashed: false };
        if (file.sheetId) {
          const src = self.spreadsheets.get(file.sheetId);
          const sid = nid("ss");
          const clone = JSON.parse(JSON.stringify({ name, sheets: src.sheets.map((s: any) => ({ ...s, textCols: [...s.textCols] })) }));
          clone.sheets.forEach((s: any) => (s.textCols = new Set(s.textCols)));
          self.spreadsheets.set(sid, { id: sid, name, sheets: clone.sheets });
          copy.id = sid;
          copy.sheetId = sid;
        }
        self.files.set(copy.id, copy);
        return self.fileApi(copy);
      },
    };
  }

  // ---------- Utilities / Blob ----------
  blob(data: any, mime?: string, name?: string): any {
    let bytes: number[];
    if (typeof data === "string") bytes = [...Buffer.from(data, "utf8")].map((b) => (b > 127 ? b - 256 : b));
    else bytes = [...data];
    let n = name ?? "";
    let m = mime ?? "text/plain";
    const self = this;
    return {
      getBytes: () => bytes,
      getName: () => n,
      setName(x: string) {
        n = x;
        return this;
      },
      getContentType: () => m,
      setContentType(x: string) {
        m = x;
        return this;
      },
      getDataAsString: () => Buffer.from(bytes.map((b) => b & 255)).toString("utf8"),
      __self: self,
    };
  }

  // ---------- Spreadsheet ----------
  private sheetApi(ss: any, sh: any): any {
    const self = this;
    const assertRange = (r: number, c: number, nr: number, nc: number) => {
      if (r < 1 || c < 1 || nr < 1 || nc < 1 || r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) {
        throw new Error("The coordinates or dimensions of the range are invalid.");
      }
    };
    const rangeApi = (r: number, c: number, nr: number, nc: number): any => {
      assertRange(r, c, nr, nc);
      const api: any = {
        getValues() {
          self.stats.sheetReads++;
          const out: Cell[][] = [];
          for (let i = 0; i < nr; i++) {
            const row = sh.grid[r - 1 + i] ?? [];
            out.push(Array.from({ length: nc }, (_v, j) => row[c - 1 + j] ?? ""));
          }
          return out;
        },
        setValues(values: Cell[][]) {
          if (values.length !== nr || values.some((v) => v.length !== nc)) {
            throw new Error(`The number of rows/columns in the data does not match the range (${nr}x${nc}).`);
          }
          self.stats.sheetWrites++;
          for (let i = 0; i < nr; i++) {
            while (sh.grid.length < r + i) sh.grid.push([]);
            const row = sh.grid[r - 1 + i];
            for (let j = 0; j < nc; j++) {
              let v = values[i][j] as any;
              const text = sh.textCols.has(c + j);
              if (typeof v === "string" && !text && v !== "") {
                if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v); // real Sheets would turn "01711…" into 1711…
                else if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(v)) v = new self.DateCtor(v);
                else if (/^(TRUE|FALSE)$/i.test(v)) v = v.toUpperCase() === "TRUE";
              }
              if (typeof v === "string" && v.length > 50000) throw new Error("Cell exceeds the 50,000 character limit");
              row[c - 1 + j] = v;
            }
          }
          return api;
        },
        setNumberFormat(fmt: string) {
          if (fmt === "@") for (let j = 0; j < nc; j++) sh.textCols.add(c + j);
          return api;
        },
        setFontWeight: () => api,
        setBackground: () => api,
        setNote: () => api,
      };
      return api;
    };
    return {
      getName: () => sh.name,
      setName(n: string) {
        sh.name = n;
        return this;
      },
      getRange: rangeApi,
      getLastRow() {
        for (let i = sh.grid.length - 1; i >= 0; i--) if ((sh.grid[i] ?? []).some((v: Cell) => v !== "" && v !== undefined)) return i + 1;
        return 0;
      },
      getMaxRows: () => sh.maxRows,
      insertRowsAfter(after: number, n: number) {
        sh.maxRows += n;
        void after;
      },
      deleteRow(n: number) {
        if (n < 1 || n > sh.maxRows) throw new Error("Invalid row");
        self.stats.sheetWrites++;
        sh.grid.splice(n - 1, 1);
      },
      setFrozenRows: () => undefined,
    };
  }

  spreadsheetApi(ss: any): any {
    const self = this;
    const mkSheet = (name: string) => {
      const sh = { name, grid: [] as Cell[][], maxRows: 1000, maxCols: 26, textCols: new Set<number>() };
      ss.sheets.push(sh);
      return self.sheetApi(ss, sh);
    };
    const find = (name: string) => ss.sheets.find((s: any) => s.name === name);
    return {
      getId: () => ss.id,
      getUrl: () => `https://docs.google.com/spreadsheets/d/${ss.id}`,
      getSheets: () => ss.sheets.map((s: any) => self.sheetApi(ss, s)),
      getSheetByName: (n: string) => (find(n) ? self.sheetApi(ss, find(n)) : null),
      insertSheet: (n: string) => mkSheet(n),
    };
  }

  createSpreadsheet(name: string) {
    const ss = { id: nid("ss"), name, sheets: [] as any[] };
    ss.sheets.push({ name: "Sheet1", grid: [], maxRows: 1000, maxCols: 26, textCols: new Set<number>() });
    this.spreadsheets.set(ss.id, ss);
    const file = { id: ss.id, name, mime: "application/vnd.google-apps.spreadsheet", bytes: Buffer.alloc(0), parent: this.rootDriveFolder.id, trashed: false, description: "", sheetId: ss.id };
    this.files.set(file.id, file);
    return { ss, file };
  }

  // ---------- globals handed to the script ----------
  globals(): Record<string, unknown> {
    const self = this;
    const props = {
      getProperty: (k: string) => (self.props.has(k) ? self.props.get(k)! : null),
      setProperty: (k: string, v: string) => void self.props.set(k, String(v)),
      deleteProperty: (k: string) => void self.props.delete(k),
    };
    const scriptCache = {
      get(k: string) {
        const e = self.cache.get(k);
        if (!e || e.exp < self.now) return null;
        return e.v;
      },
      put(k: string, v: string, ttl = 600) {
        if (v.length > 100_000) throw new Error("Argument too large: value");
        self.cache.set(k, { v, exp: self.now + ttl * 1000 });
      },
      putAll(o: Record<string, string>, ttl = 600) {
        for (const [k, v] of Object.entries(o)) scriptCache.put(k, v, ttl);
      },
      getAll(keys: string[]) {
        const out: Record<string, string> = {};
        for (const k of keys) {
          const v = scriptCache.get(k);
          if (v !== null) out[k] = v;
        }
        return out;
      },
      remove: (k: string) => void self.cache.delete(k),
      removeAll: (ks: string[]) => ks.forEach((k) => self.cache.delete(k)),
    };
    return {
      PropertiesService: { getScriptProperties: () => props },
      CacheService: { getScriptCache: () => scriptCache },
      LockService: {
        getScriptLock: () => ({
          waitLock() {
            if (self.lockHeld) throw new Error("Lock timeout: another process is holding the lock");
            self.lockHeld = true;
            self.stats.lockWaits++;
          },
          releaseLock() {
            self.lockHeld = false;
          },
        }),
      },
      ContentService: {
        MimeType: { JSON: "application/json" },
        createTextOutput: (t: string) => ({ content: t, setMimeType() { return this; }, getContent() { return t; } }),
      },
      Utilities: {
        getUuid: () => randomUUID(),
        newBlob: (d: any, m?: string, n?: string) => self.blob(d, m, n),
        base64Encode: (d: any) => Buffer.from(typeof d === "string" ? Buffer.from(d, "utf8") : Buffer.from(d.map((b: number) => b & 255))).toString("base64"),
        base64Decode: (s: string) => [...Buffer.from(s, "base64")].map((b) => (b > 127 ? b - 256 : b)),
        gzip: (blob: any) => self.blob([...zlib.gzipSync(Buffer.from(blob.getBytes().map((b: number) => b & 255)))].map((b) => (b > 127 ? b - 256 : b)), "application/x-gzip"),
        ungzip: (blob: any) => self.blob([...zlib.gunzipSync(Buffer.from(blob.getBytes().map((b: number) => b & 255)))].map((b) => (b > 127 ? b - 256 : b))),
      },
      SpreadsheetApp: {
        create: (name: string) => self.spreadsheetApi(self.createSpreadsheet(name).ss),
        openById(id: string) {
          const ss = self.spreadsheets.get(id);
          if (!ss) throw new Error(`Unexpected error while getting the method or property openById on object SpreadsheetApp.`);
          return self.spreadsheetApi(ss);
        },
      },
      DriveApp: {
        createFolder: (name: string) => self.folderApi(self.newFolder(name, self.rootDriveFolder.id)),
        getFolderById(id: string) {
          const f = self.folders.get(id);
          if (!f) throw new Error(`No item with the given ID could be found: ${id}`);
          return self.folderApi(f);
        },
        getFileById(id: string) {
          const f = self.files.get(id);
          if (!f) throw new Error(`No item with the given ID could be found: ${id}`);
          return self.fileApi(f);
        },
      },
      UrlFetchApp: {
        fetch(url: string) {
          const rel = url.replace(self.fetchBase + "/", "");
          let body: string | null = null;
          try {
            body = url.startsWith(self.fetchBase) ? readFileSync(path.join(self.fetchRoot, rel), "utf8") : null;
          } catch {
            body = null;
          }
          return { getResponseCode: () => (body === null ? 404 : 200), getContentText: () => body ?? "" };
        },
      },
      ScriptApp: {
        getProjectTriggers: () => self.triggers.map((t) => ({ getHandlerFunction: () => t.fn, __t: t })),
        deleteTrigger: (t: any) => void (self.triggers = self.triggers.filter((x) => x !== t.__t)),
        newTrigger: (fn: string) => {
          const b: any = {
            timeBased: () => b,
            everyDays: () => b,
            atHour: () => b,
            create: () => void self.triggers.push({ fn }),
          };
          return b;
        },
      },
    };
  }
}

export interface Reply {
  ok: boolean;
  status?: number;
  error?: string;
   
  data?: any;
}

/** Loads the real bundled Code.js into a vm context wired to the emulator. */
export class GasHarness {
  emu: Emulator;
  ctx: any;
  token: string | null = null;

  constructor(codePath: string, dataDir: string) {
    this.emu = new Emulator(dataDir);
    const sandbox: any = { console, ...this.emu.globals() };
    this.ctx = vm.createContext(sandbox);
    this.emu.setDateCtor(vm.runInContext("Date", this.ctx));
    vm.runInContext(readFileSync(codePath, "utf8"), this.ctx, { filename: "Code.js" });
  }

  prop(k: string, v?: string) {
    if (v === undefined) return this.emu.props.get(k) ?? null;
    this.emu.props.set(k, v);
    return v;
  }

  call(fn: string, ...args: unknown[]) {
    return this.ctx[fn](...args);
  }

  async req(method: string, p: string, body?: unknown, token: string | null | undefined = undefined): Promise<Reply> {
    const raw = JSON.stringify({ token: token === undefined ? this.token : token, method, path: p, body });
    const out = this.ctx.doPost({ postData: { contents: raw } });
    return JSON.parse(out.getContent());
  }

  async login(email: string, password: string): Promise<Reply> {
    const r = await this.req("POST", "/api/auth/login", { email, password }, null);
    if (r.ok) this.token = r.data.token;
    return r;
  }

  sheet(name: string): any[][] {
    for (const ss of this.emu.spreadsheets.values()) {
      const sh = ss.sheets.find((s: any) => s.name === name);
      if (sh) return sh.grid.filter((r: any[]) => r.some((v) => v !== "" && v !== undefined));
    }
    throw new Error(`no sheet ${name}`);
  }
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
