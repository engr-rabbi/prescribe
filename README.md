# Smart Rx — Smart Digital Prescription Management System

Bilingual (English / বাংলা) digital prescription app for chamber practice:
click-to-select clinical fields, a **21,714-medicine** catalogue, live A4 preview,
three print templates, finalize / revision workflow, patients, admin tools.

This version is a **fully static site** that can be hosted on **GitHub Pages**, in two modes:

| Mode | Where data lives | When |
| --- | --- | --- |
| **Google mode** (`API_URL` set) | **Google Sheets** (all structured data, 22 worksheets) + **Google Drive** (PDFs, images, reports, backups) via a Google Apps Script web app | real use — see **[docs/GOOGLE-SETUP.md](docs/GOOGLE-SETUP.md)** and [docs/DATA-MODEL.md](docs/DATA-MODEL.md) |
| **Local demo** (default) | the visitor's browser (IndexedDB) | trying the app out, no Google account needed |

---

## Google Sheets + Drive mode (summary)

```
Browser (GitHub Pages) ──HTTPS──▶ Apps Script web app (secrets in Script Properties) ──▶ Google Sheets + Google Drive
```
* Same handlers as the demo (roles, validation, audit) bundled for Apps Script: `npm run build:gas` → `apps-script/dist/Code.js`.
* Passwords: PBKDF2-SHA256 (100k rounds) + per-user salt + server pepper — never plain text. Signed 7-day session tokens, login lock-out, role-scoped access to every row and file.
* Sheets/Drive stay **private** to your Google account; the web-app URL is public but useless without a token.
* Files (patient reports, X-ray/CT/MRI/ultrasound, prescription PDFs, doctor photo/signature/logo, backups, exports) live in Drive folders; the `Files` sheet records Drive ID, name, MIME type, owner and related record.
* Batch reads/writes, diff-only row updates, CacheService caching, script-lock for concurrent writers, nightly backup trigger.
* Deploy: set repository variable **`API_URL`** to the `/exec` URL → the workflow builds the Google mode.
* Test without Google: `npm run dev:google-emulator` (real bundle on an in-memory Google emulator) + `NEXT_PUBLIC_API_URL=http://localhost:8787/exec npm run dev`.

> The automated tests run against an **emulator** of the Google services. Follow the 10-minute checklist in
> `docs/GOOGLE-SETUP.md → "আসল Google-এ যাচাই"` once against your real account.

## How the local demo works on GitHub Pages

GitHub Pages can only serve static files, so the old Next.js API routes + Prisma/SQLite
server were replaced by an **in-browser backend** (`src/lib/local-backend/`):

| Before (server) | Now (static) |
| --- | --- |
| `/api/*` Next.js routes | Same endpoints, same validation & permissions, run in the browser (`router.ts`, `handlers.ts`) |
| Prisma + SQLite (`custom.db`) | IndexedDB (in-memory tables written through to IndexedDB) |
| Cookie sessions + scrypt | Session token + PBKDF2 (Web Crypto) |
| `medicine_english.csv` imported to SQL | CSV shipped as `public/data/medicines.csv`, loaded lazily and searched in memory |
| Seeded DB | `public/data/seed.json` + `libraries.json`, applied on first visit |

The UI components still call the same `api.*` client — nothing in the screens had to change.

> ### ⚠️ Local demo only: where is the data stored?
> Without `API_URL`, data lives **in each visitor's browser** (IndexedDB). It is **not shared between devices or users**
> and is lost if the browser data / site data is cleared. GitHub Pages is a public host:
> do **not** put real patient data into a public deployment expecting server-side privacy or backup.
> For multi-device / multi-user clinic use you need a real backend (e.g. Supabase) — the clean API
> boundary in `src/lib/api-client.ts` makes that swap local to one file.

### Demo accounts (first run)

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `admin@rx.local` | `admin123` |
| Doctor | `doctor@rx.local` | `doctor123` |
| Assistant | `assistant@rx.local` | `assistant123` |

These are public (they ship in the static files) — change them from **Admin → Users** / change-password,
and remember anyone can read the bundled seed files. Passwords you change are stored only in your browser.

Reset to the bundled demo data: open the site, DevTools → Application → *Clear site data*.

---

## Deploy to GitHub Pages (step by step)

1. **Create a repository** on GitHub (e.g. `smart-rx`) — public (or private on a paid plan).
2. **Push this project** (the folder containing `package.json`):
   ```bash
   git init
   git add -A
   git commit -m "Smart Rx static build"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<repo>.git
   git push -u origin main
   ```
3. On GitHub open **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
4. The push already triggered **Actions → "Deploy to GitHub Pages"**. Wait for the green check
   (≈ 2 min). Your site is live at
   `https://<your-user>.github.io/<repo>/`
   (for a `<user>.github.io` repo it is served from `https://<user>.github.io/`).
5. Every later push to `main` redeploys automatically. You can also run the workflow manually
   from the **Actions** tab (*Run workflow*).

Custom domain? Settings → Pages → *Custom domain*. For a domain at the root, set the repository
variable approach below or edit the workflow so `NEXT_PUBLIC_BASE_PATH` is empty.

### What the workflow does (`.github/workflows/deploy.yml`)
`npm ci` → `npm test` (backend tests) → `npm run build` (static export to `out/`) → publish `out/`.
The base path is computed automatically from the repository name, so assets, data files and the
favicon resolve correctly under `/<repo>/`.

### Manual deploy (without Actions)
```bash
NEXT_PUBLIC_BASE_PATH=/<repo> npm run build   # → ./out   (omit the variable for a root site)
# publish the contents of ./out to the gh-pages branch / any static host
```

---

## Local development

```bash
npm install
npm run dev            # http://localhost:3000
npm run typecheck
npm run lint
npm test               # local-backend tests + Google Apps Script bundle on the Google emulator (37 tests)
npm run build:gas      # apps-script/dist/Code.js (+ appsscript.json) to paste into Apps Script
npm run dev:google-emulator   # fake Google on http://localhost:8787/exec
npm run build          # static export → out/
NEXT_PUBLIC_BASE_PATH=/smart-rx npm run build && npm run preview   # test a sub-path build
```

## Navigation, refresh and direct links

The current screen is kept in the URL hash (`#/patients`, `#/prescriptions`, `#/editor/<id>` …), so
**refresh, Back/Forward and copied links work** on GitHub Pages (which can only serve `index.html`).
A draft that has been saved reopens after a refresh; unsaved edits are not persisted.

## Sidebar: collapse / expand (Prescription workspace)

* The toggle button sits at the top of the left sidebar (desktop ≥ 1024 px).
* Collapsed → a 72 px icon rail (labels become tooltips) and the editor + live preview get the extra width.
* Smooth 300 ms width animation (disabled for `prefers-reduced-motion`); the choice is remembered.
* Tablets and phones (< 1024 px) use the slide-in menu (hamburger) and the editor shows **Editor | Preview** tabs.

## Project structure

```
.github/workflows/deploy.yml   GitHub Pages workflow
public/data/                   medicines.csv, libraries.json, seed.json (static data)
public/.nojekyll               lets GitHub Pages serve the _next/ folder
scripts/export-seed-data.py    how seed.json / libraries.json were produced from the old SQLite DB
src/app/                       Next.js app (single static page)
src/components/                UI (shell, editor, preview, patients, admin …)
src/lib/local-backend/         shared backend core (handlers, router, files, store) — runs in the browser AND inside Apps Script
src/lib/remote-client.ts       talks to the Apps Script web app (Google mode)
apps-script/src/               Google adapters: Sheets persistence, Drive files, setup, entry points
apps-script/dist/              generated Code.js + appsscript.json (paste into Apps Script)
docs/                          GOOGLE-SETUP.md, DATA-MODEL.md
src/lib/api-client.ts          typed API client used by every screen
tests/backend.test.ts          local-backend tests · tests/gas.test.ts + gas-emulator.ts: Apps Script bundle on a Google emulator
next.config.ts                 output: "export", basePath from NEXT_PUBLIC_BASE_PATH
```

## Role rules (unchanged)

* Only **DOCTOR** can finalize / revise; **DOCTOR** and **SUPER_ADMIN** can create / edit / duplicate / delete drafts;
  **ASSISTANT** can manage patients and view prescriptions.
* Finalized prescriptions are immutable — corrections create a revision (`version + 1`).
* Every mutation is written to the audit log (Admin → Audit logs).
