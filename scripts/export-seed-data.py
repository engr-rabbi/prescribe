#!/usr/bin/env python3
"""
One-off exporter: turns the original server database (SQLite / Prisma) into the
static JSON files that the GitHub-Pages build loads in the browser.

  python3 scripts/export-seed-data.py path/to/custom.db public/data

Outputs
  libraries.json  – shared click-to-select libraries (complaints, diagnoses, …)
  seed.json       – demo users / doctor profile / chambers / template /
                    sample patients & prescriptions (no password hashes,
                    no sessions, no audit log)
The medicine catalogue is shipped as the original CSV (public/data/medicines.csv).
"""
import json, sqlite3, sys, os

db_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
c = sqlite3.connect(db_path)
c.row_factory = sqlite3.Row


def rows(sql):
    return [dict(r) for r in c.execute(sql)]


def iso(ms):
    if ms is None:
        return None
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def dates(d, keys):
    for k in keys:
        if k in d:
            d[k] = iso(d[k])
    return d


# ---- libraries (compact: array rows) ---------------------------------------
lib = rows("select id, category, subcategory, labelEn, labelBn, code, keywords, isCustom, usageCount "
           "from LibraryItem order by category, rowid")
libs = [[r["id"], r["category"], r["subcategory"], r["labelEn"], r["labelBn"], r["code"],
         r["keywords"], 1 if r["isCustom"] else 0, r["usageCount"]] for r in lib if not r["isCustom"]]
with open(os.path.join(out_dir, "libraries.json"), "w", encoding="utf-8") as f:
    json.dump({"cols": ["id", "category", "subcategory", "labelEn", "labelBn", "code", "keywords", "isCustom", "usageCount"],
               "rows": libs}, f, ensure_ascii=False, separators=(",", ":"))

# ---- seed ------------------------------------------------------------------
users = [dates(u, ["createdAt", "updatedAt"]) for u in
         rows("select id,email,name,role,active,createdAt,updatedAt from User order by createdAt")]
for u in users:
    u["active"] = bool(u["active"])
doctors = [dates(d, ["createdAt", "updatedAt"]) for d in rows("select * from Doctor")]
for d in doctors:
    d["showLogo"] = bool(d["showLogo"]); d["showPhoto"] = bool(d["showPhoto"])
chambers = [dates(d, ["createdAt", "updatedAt"]) for d in rows("select * from Chamber")]
for d in chambers:
    d["isPrimary"] = bool(d["isPrimary"])
templates = [dates(d, ["createdAt", "updatedAt"]) for d in rows("select * from PrescriptionTemplate")]
for d in templates:
    d["isDefault"] = bool(d["isDefault"])
patients = [dates(d, ["createdAt", "updatedAt", "dob"]) for d in rows("select * from Patient")]
rx = [dates(d, ["createdAt", "updatedAt", "prescriptionDate", "followUpDate", "finalizedAt"])
      for d in rows("select * from Prescription")]
meds = rows("select * from PrescriptionMedicine")

seed = dict(users=users, doctors=doctors, chambers=chambers, templates=templates,
            patients=patients, prescriptions=rx, prescriptionMedicines=meds,
            defaultPasswords={"admin@rx.local": "admin123", "doctor@rx.local": "doctor123",
                              "assistant@rx.local": "assistant123"})
with open(os.path.join(out_dir, "seed.json"), "w", encoding="utf-8") as f:
    json.dump(seed, f, ensure_ascii=False, separators=(",", ":"))
print("libraries:", len(libs), "| users:", len(users), "| patients:", len(patients), "| prescriptions:", len(rx))
