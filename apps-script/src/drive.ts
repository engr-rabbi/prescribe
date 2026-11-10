// Google Drive: file bytes, folder tree, doctor images, backups.
// Everything is created PRIVATE (owned by the account that deployed the script);
// nothing here ever calls setSharing().

import { HttpError } from "../../src/lib/local-backend/errors";
import type { AssetStore, AssetKind, BackupProvider, FileBackend } from "../../src/lib/local-backend/runtime";
import { tables, touch, type FileRow } from "../../src/lib/local-backend/store";
import { saveFile, trashFile } from "../../src/lib/local-backend/files";
import { newId } from "../../src/lib/local-backend/crypto";
import { TOP_FOLDERS } from "../../src/lib/local-backend/files";

const props = () => PropertiesService.getScriptProperties();

function rootFolder() {
  const id = props().getProperty("ROOT_FOLDER_ID");
  if (!id) throw new Error("ROOT_FOLDER_ID is not configured — run setup() first");
  return DriveApp.getFolderById(id);
}

function childFolder(parent: any, name: string) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** Resolve "A/B/C" under the system root, creating missing folders. Cached per path. */
export function ensureFolderPath(path: string) {
  const cache = CacheService.getScriptCache();
  const key = `rx:folder:${path}`;
  const hit = cache.get(key);
  if (hit) {
    try {
      const f = DriveApp.getFolderById(hit);
      if (!f.isTrashed()) return f;
    } catch {
      /* stale — recreate */
    }
  }
  let folder = rootFolder();
  for (const part of path.split("/").filter(Boolean)) folder = childFolder(folder, part);
  cache.put(key, folder.getId(), 21_600);
  return folder;
}

export const driveFiles: FileBackend = {
  write(meta, dataBase64) {
    const folder = ensureFolderPath(meta.folderPath);
    const blob = Utilities.newBlob(Utilities.base64Decode(dataBase64), meta.mimeType, meta.name);
    const file = folder.createFile(blob);
    file.setDescription(
      `Smart Rx · ${meta.kind} · ${meta.relatedType}:${meta.relatedId} · by ${meta.ownerEmail || "system"} · record ${meta.id}`
    );
    return file.getId();
  },
  read(row: FileRow) {
    if (row.kind === "BACKUP") throw new HttpError(400, "Backups are Google Sheets copies — open them in Google Drive");
    try {
      return Utilities.base64Encode(DriveApp.getFileById(row.storageKey).getBlob().getBytes());
    } catch {
      throw new HttpError(404, "The file is no longer available in Google Drive");
    }
  },
  remove(row: FileRow) {
    try {
      DriveApp.getFileById(row.storageKey).setTrashed(true);
    } catch {
      /* already gone */
    }
  },
};

// ----- doctor photo / signature / logo ---------------------------------------

const ASSET_CACHE_MAX = 90_000; // CacheService limit is 100 kB per value

function parseDataUrl(v: string): { mime: string; b64: string } {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(v);
  if (!m) throw new HttpError(400, "Image must be a base64 data URL");
  return { mime: m[1], b64: m[2] };
}

export const driveAssets: AssetStore = {
  store(doctorId, kind: AssetKind, value, userId) {
    if (value.startsWith("file:")) return value;
    const { mime, b64 } = parseDataUrl(value);
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(mime)) throw new HttpError(415, "Only image files are allowed here");
    const user = tables.users.find((u) => u.id === userId);
    // replace: move the previous image of this kind to the Drive trash
    for (const old of tables.files.filter((f) => !f.deleted && f.kind === kind && f.relatedId === doctorId)) trashFile(old);
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const row = saveFile({
      kind,
      relatedType: "DOCTOR",
      relatedId: doctorId,
      name: `${kind.toLowerCase()}.${ext}`,
      mimeType: mime,
      dataBase64: b64,
      user: user ? { id: user.id, email: user.email } : null,
    });
    return `file:${row.id}`;
  },
  resolve(value) {
    if (!value || !value.startsWith("file:")) return value; // legacy inline data URL / empty
    const memoHit = memo.get(value);
    if (memoHit !== undefined) return memoHit;
    const out = resolveUncached(value);
    memo.set(value, out);
    return out;
  },
};

const memo = new Map<string, string>(); // per execution

function resolveUncached(value: string): string {
  {
    const id = value.slice(5);
    const row = tables.files.find((f) => f.id === id && !f.deleted);
    if (!row) return "";
    const cache = CacheService.getScriptCache();
    const hit = cache.get(`rx:asset:${row.storageKey}`);
    if (hit) return hit;
    const url = `data:${row.mimeType};base64,${driveFiles.read(row)}`;
    if (url.length <= ASSET_CACHE_MAX) cache.put(`rx:asset:${row.storageKey}`, url, 21_600);
    return url;
  }
}

// ----- backups ---------------------------------------------------------------

function retentionCount(): number {
  const n = Number(props().getProperty("BACKUP_RETENTION") || 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export const driveBackup: BackupProvider = {
  run(userId, userEmail) {
    const ssId = props().getProperty("SPREADSHEET_ID");
    if (!ssId) throw new HttpError(500, "SPREADSHEET_ID is not configured");
    const folder = ensureFolderPath("System Backups");
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const name = `SmartRx-Backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    const copy = DriveApp.getFileById(ssId).makeCopy(name, folder);
    const row: FileRow = {
      id: newId(),
      storageKey: copy.getId(),
      name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      size: 0,
      kind: "BACKUP",
      relatedType: "SYSTEM",
      relatedId: "",
      folderPath: "System Backups",
      ownerUserId: userId,
      ownerEmail: userEmail,
      createdAt: d.toISOString(),
      deleted: false,
    };
    tables.files.push(row);
    // retention: keep the newest N backups, trash the rest
    const backups = tables.files.filter((f) => f.kind === "BACKUP" && !f.deleted).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    for (const old of backups.slice(retentionCount())) {
      try {
        DriveApp.getFileById(old.storageKey).setTrashed(true);
      } catch {
        /* already gone */
      }
      old.deleted = true;
    }
    touch("files");
    return row;
  },
};
