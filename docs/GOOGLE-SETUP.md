# Google Sheets + Google Drive সেটআপ গাইড

এই গাইড অনুসরণ করলে আপনার Smart Rx-এর সব স্ট্রাকচার্ড ডেটা **Google Sheets**-এ এবং সব ফাইল (PDF, ছবি, রিপোর্ট, ব্যাকআপ) **Google Drive**-এ সংরক্ষিত হবে।

## আর্কিটেকচার (কেন এভাবে?)

```
ব্রাউজার (GitHub Pages — স্ট্যাটিক সাইট)
   │  HTTPS POST  { token, method, path, body }
   ▼
Google Apps Script Web App  ← এখানে সব Secret (Script Properties)
   │  ├─ Google Sheets  (ডেটাবেস – ২২টি ওয়ার্কশিট)
   │  └─ Google Drive   (ফাইল – ১০টি ফোল্ডার)
```

* GitHub Pages শুধু স্ট্যাটিক ফাইল দেয়, তাই Google-এর Credential সেখানে রাখলে যে কেউ চুরি করতে পারত। Credential থাকে **শুধু Apps Script-এর Script Properties-এ**।
* Apps Script আপনার (ডিপ্লয়কারীর) Google অ্যাকাউন্টের অনুমতিতে চলে — আলাদা Service Account Key ফাইল ডাউনলোড/সংরক্ষণ করার ঝুঁকি নেই। Sheet ও Drive ফোল্ডার **Private** (শুধু আপনার অ্যাকাউন্ট)। কোথাও "Anyone with the link" দেওয়া হয় না।
* Web App URL পাবলিক (ব্রাউজার থেকে কল করতে হয়), কিন্তু **লগইন ও health ছাড়া প্রতিটি কলে সই করা সেশন টোকেন লাগে**।
* বিদ্যমান Next.js হ্যান্ডলার (রোল, ভ্যালিডেশন, অডিট) হুবহু একই কোড Apps Script-এ বান্ডল হয় (`npm run build:gas`) — তাই আচরণ একই।

## ধাপ ১ — Apps Script প্রজেক্ট তৈরি

1. https://script.google.com → **New project** → নাম দিন `Smart Rx Backend`।
2. বাম পাশে **Project Settings (⚙)** → ✔ **Show "appsscript.json" manifest file in editor**।
3. এডিটরে `Code.gs`-এর পুরো লেখা মুছে এই রিপোজিটরির **`apps-script/dist/Code.js`** ফাইলের পুরো কনটেন্ট পেস্ট করুন। (নিজে বানাতে চাইলে: `npm install && npm run build:gas`)
4. `appsscript.json`-এর কনটেন্ট মুছে **`apps-script/dist/appsscript.json`** পেস্ট করুন (টাইমজোন, V8, OAuth scope ও web-app সেটিং আছে)।
5. Save (Ctrl+S)।

> বিকল্প: [`clasp`](https://github.com/google/clasp) ব্যবহার করে `apps-script/dist` পুশ করা যায়।

## ধাপ ২ — Script Properties (Secrets / Environment Variables)

**Project Settings → Script properties → Add script property**:

| Property | মান | মন্তব্য |
| --- | --- | --- |
| `ADMIN_EMAIL` | আপনার অ্যাডমিন ইমেইল | প্রথম Super Admin |
| `ADMIN_PASSWORD` | কমপক্ষে ১০ অক্ষরের শক্ত পাসওয়ার্ড | **setup শেষে স্বয়ংক্রিয়ভাবে মুছে যায়** |
| `SEED_BASE_URL` | `https://<user>.github.io/<repo>/data` | সাইটের `/data` ফোল্ডার (ওষুধ ও লাইব্রেরি সিড) — আগে সাইট ডিপ্লয় করুন। ⚠️ `/public/data` **নয়** — GitHub Pages-এ `public` ফোল্ডারের নাম URL-এ আসে না। ব্রাউজারে `…/data/libraries.json` খুলে JSON আসছে কি না আগে দেখুন |
| `SEED_DEMO` | `true` (ঐচ্ছিক) | শুধু টেস্টের জন্য ডেমো ইউজার/রোগী বসায়; প্রোডাকশনে **দেবেন না** |

`setup` নিজে তৈরি করে (আপনাকে কিছু করতে হবে না): `SESSION_SECRET` (টোকেন সইয়ের কী), `PASSWORD_PEPPER` (পাসওয়ার্ড হ্যাশের সার্ভার-সিক্রেট), `SPREADSHEET_ID`, `ROOT_FOLDER_ID`, `BACKUP_RETENTION` (ডিফল্ট ৩০)।

> ⚠️ `PASSWORD_PEPPER` ও `SESSION_SECRET` হারালে/বদলালে সবার পাসওয়ার্ড/লগইন অকার্যকর হবে। এগুলো কারও সাথে শেয়ার করবেন না, Git-এ রাখবেন না।

## ধাপ ৩ — setup চালান

1. এডিটরের ওপরে ফাংশন বাছুন **`setup`** → **Run**।
2. **Authorization required → Review permissions** → আপনার অ্যাকাউন্ট → (“Google hasn't verified this app” এলে *Advanced → Go to Smart Rx Backend (unsafe)* — এটা আপনার নিজের স্ক্রিপ্ট) → **Allow**।
3. Execution log-এ দেখবেন: `Setup complete`, Database লিংক, Drive root ফোল্ডার লিংক।

`setup` যা করে (একাধিকবার চালানো নিরাপদ, ডুপ্লিকেট হয় না):

* Drive-এ **Smart Prescription System/** ও ১০টি সাবফোল্ডার
* ফোল্ডারের ভেতরে **Smart Prescription System — Database** স্প্রেডশিট, ২২টি ওয়ার্কশিট (হেডার, ফ্রিজ, টেক্সট ফরম্যাট)
* Roles, SystemSettings, অ্যাডমিন ইউজার (হ্যাশ করা পাসওয়ার্ড), ~১,৬০০ লাইব্রেরি এন্ট্রি, ২১,৭১৪ ওষুধ
* প্রতি রাত ২টায় স্বয়ংক্রিয় ব্যাকআপ ট্রিগার

## ধাপ ৪ — Web App হিসেবে Deploy

1. **Deploy → New deployment → ⚙ Select type → Web app**
2. **Execute as: Me** · **Who has access: Anyone**
3. **Deploy** → **Web app URL** (`https://script.google.com/macros/s/…/exec`) কপি করুন।

> "Anyone" মানে URL-এ পৌঁছানো যায়; **ডেটা নয়**। টোকেন ছাড়া কিছুই পাওয়া যায় না। কোড বদলালে *Deploy → Manage deployments → ✏ → New version*।

## ধাপ ৫ — ফ্রন্টএন্ডকে সংযুক্ত করুন

GitHub রিপোজিটরি → **Settings → Secrets and variables → Actions → Variables → New repository variable**:

* Name: `API_URL` · Value: উপরের `/exec` URL

তারপর **Actions → Deploy to GitHub Pages → Run workflow**। সাইটে লগইন করলে ডেটা এখন Google Sheets/Drive-এ যাবে।

(লোকালি: `.env.local`-এ `NEXT_PUBLIC_API_URL=<url>` দিয়ে `npm run dev`।)

---

## সমস্যা সমাধান (Troubleshooting)

**লগইন পেজে এখনো "Demo accounts" (doctor@rx.local …) বক্স দেখাচ্ছে / আমার অ্যাডমিন ইমেইল-পাসওয়ার্ড কাজ করছে না**
সাইটটি এখনো *লোকাল ডেমো মোডে* আছে — Google ব্যাকএন্ডে সংযুক্ত নয়। Google মোডে ডেমো বক্স থাকে না। ঠিক করুন:
1. GitHub রিপো → **Settings → Secrets and variables → Actions → ট্যাব "Variables"** (⚠️ "Secrets" নয়) → `API_URL` = Apps Script `/exec` URL (`https://script.google.com/macros/s/…/exec`)।
2. **Actions → Deploy to GitHub Pages → Run workflow**; সবুজ টিক এলে সাইট রিফ্রেশ (Ctrl+Shift+R)।
3. ব্রাউজারের F12 → Network-এ লগইনের সময় `script.google.com` এ রিকোয়েস্ট যাচ্ছে কি না দেখুন।

**Google মোডে লগইন হচ্ছে না (বার্তা সহ)**
* "Cannot reach the Google backend" → `/exec` URL ভুল, বা Deploy-এ *Who has access: Anyone* দেওয়া হয়নি।
* "Too many failed attempts" → ১৫ মিনিট অপেক্ষা, বা নিচের `resetAdminPassword` চালান (লক-ও খোলে)।
* "Invalid email or password" → setup-এর **প্রথম** সফল রানের ইমেইল/পাসওয়ার্ডই কার্যকর (পরে প্রপার্টি বদলালে ইউজার শিটে আগেরটাই থাকে)।

**অ্যাডমিন পাসওয়ার্ড ভুলে গেলে / আটকে গেলে (রিকভারি)**
1. Script Properties-এ `ADMIN_EMAIL` ও নতুন `ADMIN_PASSWORD` (≥১০ অক্ষর) দিন।
2. এডিটরে ফাংশন **`resetAdminPassword`** → Run। (অ্যাকাউন্ট না থাকলে তৈরি করে, থাকলে পাসওয়ার্ড বদলায়, নিষ্ক্রিয় থাকলে চালু করে, লক খোলে, আর `ADMIN_PASSWORD` মুছে ফেলে।)
3. কোড আপডেট করলে **Deploy → Manage deployments → ✏ → New version**।

**`setup` এ "Could not download …/libraries.json (HTTP 404)"** → `SEED_BASE_URL` ভুল (উপরের সারি দেখুন)। ঠিক করে আবার Run — আগের কাজ ডুপ্লিকেট হয় না।

## Drive ফোল্ডার কাঠামো ও নামকরণ

```
Smart Prescription System/
├─ Doctor Profiles/<Dr. নাম (id)>/            ← ডাক্তারের ছবি
├─ Doctor Signatures/<Dr. নাম (id)>/
├─ Clinic Logos/<Dr. নাম (id)>/
├─ Patient Documents/<PID-000123 - রোগীর নাম>/   ← ছবি, অন্যান্য ডকুমেন্ট
├─ Patient Medical Reports/<PID - নাম>/
├─ Investigation Reports/<PID - নাম>/            ← ল্যাব/টেস্ট রিপোর্ট
├─ Medical Images/<PID - নাম>/{X-ray|CT|MRI|Ultrasound}/
├─ Prescription PDFs/<Dr. নাম (id)>/<PID - নাম>/RX-YYYYMMDD-NNNN_v1.pdf
├─ Exported Reports/                             ← CSV এক্সপোর্ট
└─ System Backups/                               ← স্প্রেডশিটের নাইটলি কপি
```
ফাইলের নাম: `YYYYMMDD-HHMMSS_<ধরন>_<PID>_<মূল নাম>`। প্রতিটি ফাইলের **Drive File ID, নাম, MIME type, মালিক (ইমেইল), সম্পর্কিত রেকর্ড (রোগী/প্রেসক্রিপশন/ডাক্তার ID), ফোল্ডার, তৈরির সময়** `Files` শিটে থাকে। ফাইলের বাইনারি **কখনো** শিটে যায় না।

## কোন কাজ কোথায় যায়

| ঘটনা | Google Sheets | Google Drive |
| --- | --- | --- |
| নতুন রোগী | `Patients` | — |
| নতুন/সম্পাদিত প্রেসক্রিপশন | `Prescriptions`, `PrescriptionMedicines`, `FollowUps`, `PatientMedicalHistory` | — |
| প্রেসক্রিপশন Finalize | স্ট্যাটাস আপডেট | PDF (ব্রাউজারে তৈরি) → `Prescription PDFs/…`, রেজিস্ট্রি `Files`-এ |
| রিপোর্ট/এক্স-রে আপলোড | `Files` (Drive ID, MIME, owner, related ID) | সংশ্লিষ্ট ফোল্ডারে ফাইল |
| ডাক্তারের ছবি/সই/লোগো | `Doctors`-এ `file:<id>` রেফারেন্স + `Files` | ছবি ফাইল |
| ফাইল দেখা/ডাউনলোড | `AuditLogs` | Drive থেকে পড়ে ব্রাউজারে দেখায় |
| মোছা | রো মোছা / `deleted=TRUE` | ফাইল Drive-এর Trash-এ |
| অ্যাডমিন ব্যাকআপ / এক্সপোর্ট | `Files` | `System Backups` / `Exported Reports` |

## নিরাপত্তা

* পাসওয়ার্ড: **PBKDF2-HMAC-SHA256, ১০০,০০০ রাউন্ড, র‍্যান্ডম salt + সার্ভার pepper** → `Users.passwordHash`। প্লেইন টেক্সট কোথাও নেই (setup-এর `ADMIN_PASSWORD`ও শেষে মুছে যায়)।
* সেশন: সই করা (HMAC-SHA256) টোকেন, ৭ দিন; পাসওয়ার্ড বদলালে বা ইউজার নিষ্ক্রিয় করলে পুরোনো টোকেন বাতিল।
* ব্রুট-ফোর্স: একই ইমেইলে ৬ বার ভুল → ১৫ মিনিট লক।
* Authorization: প্রতিটি এন্ডপয়েন্টে রোল চেক — Super Admin (ইউজার/অডিট/ব্যাকআপ/ওষুধ DB), Doctor (শুধু নিজের প্রেসক্রিপশন, ফাইনালাইজ/রিভাইজ), Assistant (রোগী ও ডকুমেন্ট, প্রেসক্রিপশন read-only)। ফাইল অ্যাক্সেসও একই স্কোপে।
* ফাইল আপলোডে ধরন (MIME) তালিকা ও ৮ MB সীমা। CSV এক্সপোর্টে ফর্মুলা-ইনজেকশন প্রতিরোধ।
* শিট/ফোল্ডার শেয়ার করবেন না। শুধু বিশ্বস্ত ব্যক্তিকে **Editor** দিন (শিটে সরাসরি এডিট করলে ভ্যালিডেশন বাইপাস হয়)।

## পারফরম্যান্স ও নির্ভরযোগ্যতা

* **ব্যাচ I/O:** টেবিল প্রতি একবার `getRange().getValues()`, লেখায় শুধু **বদলানো রো** (diff), নতুন রো ব্যাচে।
* **ক্যাশ:** CacheService-এ gzip+chunk (১০ মিনিট; শিটে হাতে এডিট করলে ≤১০ মিনিটে দেখা যায়, বা `clearCaches` চালান)। ওষুধ (২১,৭১৪) ও লাইব্রেরি ব্রাউজারে একবার নামে, সার্চ লোকালি — টাইপ করতে API কল লাগে না।
* **সমকালীন আপডেট:** লেখার প্রতিটি রিকোয়েস্ট `LockService` স্ক্রিপ্ট-লকের ভেতরে; ব্যর্থ হলে কিছুই লেখা হয় না ও ক্লায়েন্ট ৩ বার রিট্রাই করে।
* **ডুপ্লিকেট:** ইউনিক `id` (UUID), ইমেইল ইউনিক, লাইব্রেরি (ক্যাটাগরি+নাম) ইউনিক, ওষুধের `brand id` ইউনিক (Re-import রিপোর্ট দেখায়)।
* **কোটা:** Apps Script (বিনামূল্যে অ্যাকাউন্ট) দৈনিক ~৯০ মিনিট রানটাইম, ৩০ সমান্তরাল এক্সিকিউশন। একটি ক্লিনিকের জন্য যথেষ্ট; প্রতি কল ~০.৫–২ সেকেন্ড (ব্রাউজার ক্যাশ/মিরর এজন্য)। বড় প্রতিষ্ঠানে PostgreSQL-এ যান (নিচে)।
* **ব্যাকআপ:** প্রতি রাতে স্প্রেডশিটের পূর্ণ কপি → `System Backups` (শেষ ৩০টি রাখে; `BACKUP_RETENTION`)। অ্যাডমিন UI থেকে "Back up now"। **রিস্টোর:** ব্যাকআপ কপি খুলে বর্তমান স্প্রেডশিটের ID বদলে `SPREADSHEET_ID` প্রপার্টিতে নতুনটির ID দিন + `clearCaches`।
* Google Sheets সীমা: ১০ মিলিয়ন সেল/স্প্রেডশিট, ৫০,০০০ অক্ষর/সেল। প্রেসক্রিপশন ছোট JSON বলে ঠিক আছে; ছবি কখনো শিটে যায় না।

## ⚠️ আসল Google-এ যাচাই (১০ মিনিট) — অবশ্যই করুন

আমাদের টেস্ট-স্যুট আসল বান্ডল করা কোডকে **Google API-এর এমুলেটরে** চালায় (`npm test`) — এটা লজিক প্রমাণ করে, কিন্তু আসল Google নয়। তাই সেটআপের পর:

1. এডিটরে `selfTest` চালান → প্রতিটি শিটের রো সংখ্যা লগে আসবে।
2. সাইটে অ্যাডমিন দিয়ে লগইন → Admin → Users-এ একজন Doctor তৈরি করুন → Doctor দিয়ে লগইন।
3. একজন রোগী নিবন্ধন → Google Sheet-এ `Patients` খুলে রো দেখুন (ফোন নম্বরের শুরুর `0` আছে কি?)।
4. প্রেসক্রিপশন তৈরি → Finalize → Drive → `Prescription PDFs/…`-এ PDF খুলুন।
5. রোগীর পেজে "Documents & reports"-এ একটি ছবি আপলোড → Drive-এর `Patient Medical Reports/…`-এ দেখুন।
6. Admin → Backups → "Back up now" → `System Backups`-এ কপি দেখুন।
7. **ব্রাউজারের Incognito উইন্ডোতে** শিট/ফোল্ডারের লিংক খুলুন → "Request access" আসা উচিত (পাবলিক নয়)।
8. ভুল পাসওয়ার্ডে ৬ বার চেষ্টা → লক বার্তা।

কিছু না মিললে: Apps Script → **Executions** ট্যাবে এরর দেখুন।

## PostgreSQL / অন্য ডেটাবেসে মাইগ্রেশন

* শিটের কাঠামো সম্পূর্ণ রিলেশনাল (`id` প্রাইমারি কী, `*Id` ফরেন কী) — দেখুন `docs/DATA-MODEL.md`।
* স্টোরেজ একটাই ইন্টারফেসের (`ServerPersistence` in `src/lib/local-backend/store.ts`) পেছনে: `loadTable / saveTables / appendAudit / readAudit`। PostgreSQL অ্যাডাপ্টার লিখলে হ্যান্ডলার, UI, টেস্ট — কিছুই বদলাবে না। ফাইল স্টোরেজও আলাদা ইন্টারফেস (`FileBackend`) — Drive থেকে S3/GCS-এ সরানো যায়।
* ডেটা এক্সপোর্ট: প্রতিটি শিট CSV হিসেবে `COPY`-এ ইমপোর্ট করা যায় (বুলিয়ান `TRUE/FALSE`, তারিখ ISO-8601)।
