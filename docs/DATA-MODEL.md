# Data model — Google Sheets worksheets

Row 1 of every worksheet is the header (validated on every read — a mismatch fails loudly instead of corrupting data).
Column 1 is always the unique `id` (UUID-like). Types: **text** (stored as plain text so `01712…`/ISO dates survive),
**number**, **bool** (TRUE/FALSE), **nullable** (empty cell = NULL).

| Worksheet | Purpose | Key columns / relations |
| --- | --- | --- |
| `Users` | accounts, roles, **password hashes** | `id`, `username` (unique), `email` (optional, unique if set), `role` (SUPER_ADMIN/DOCTOR/ASSISTANT/PATIENT), `passwordHash` (empty for patients), `status` (ACTIVE/SUSPENDED/DEACTIVATED), `mustChangePassword`, `tempPasswordExpiresAt`/`tempPasswordUsed`, `doctorId` (assistants → their doctor), `googleSub`/`patientUid` (patients) |
| `Roles` | role → permission matrix (reference; enforced in code) | `role`, `permission`, `allowed` |
| `Doctors` | doctor profiles | `id` (**the Doctor ID all data is keyed by**), `code` (DOC-YYYY-NNNN), `userId`→Users; `photoUrl/signatureUrl/logoUrl` = `file:<Files.id>` |
| `Chambers` | chambers **and doctor schedule** (days, time, serial info) | `doctorId`→Doctors |
| `Patients` | a doctor's **private** patient records | `id`, `code` (PID-…), **`doctorId`→Doctors (owner)**, `patientUid`→PatientMedicalProfiles (optional link), `createdById`→Users |
| `Prescriptions` | prescription records (complaints, history, examination, diagnosis, investigations, advice, follow-up as JSON text) | `patientId`→Patients, `doctorId`→Doctors, `chamberId`→Chambers, `rootId`/`supersededById` (revision chain), `status`, `version` |
| `PrescriptionMedicines` | medicine lines | `prescriptionId`→Prescriptions, `sortOrder`, `medicineId`→Medicines |
| `FollowUps` | follow-up records — **derived view** kept in sync automatically | `prescriptionId`, `patientId`, `followUpDate`, `status` |
| `PatientMedicalHistory` | per-visit history sections — **derived view** | `patientId`, `prescriptionId` |
| `Assistants` | assistant profile (login in `Users`) | `userId`→Users, `doctorId`→Doctors |
| `DoctorAssistantRelationships` | doctor ⇄ assistant | `doctorId`, `assistantId`, `userId`, `status` (ACTIVE/ENDED) |
| `UserPermissions` | permissions the doctor granted each assistant | `userId`, `permission`, `allowed` |
| `AccountActivationRecords` | temp-password issued/used, first password set, status changes | `userId`, `type`, `byUserId`, `expiresAt` |
| `PatientMedicalProfiles` | patient accounts (global): profile & medical information | `patientUid` (PAT-YYYY-NNNNNN, unique/permanent), `userId`→Users, `fieldUpdated` (JSON: last-updated date per field), `customFields` |
| `DoctorPatientAccess` | patient **consent** to a doctor | `patientUid`, `doctorId`, `status` (REQUESTED/GRANTED/DENIED/REVOKED), `source`, timestamps |
| `Appointments` | appointment requests | `patientUid`, `doctorId`, `chamberId`, `status`, `shareMedical` |
| `Questionnaires` · `QuestionnaireResponses` | the doctor's patient form and the patients' answers (per-answer last-updated) | `doctorId`, `patientUid` |
| `Templates` | saved print templates | `doctorId`→Doctors |
| `ChiefComplaints` · `HistoryPresets` · `ExamFindings` · `Diagnoses` · `Investigations` · `Advice` | click-to-select libraries (EN + বাংলা) | `category`, `subcategory`, `labelEn`, `labelBn`, `code`, `usageCount` |
| `CustomEntries` | entries added by users (any category) | same columns, `isCustom = TRUE`, `createdById` |
| `Medicines` | medicine master (21,714 rows) — edit here, then Admin → **Re-import** to validate | `id` (brand id), `brandName`, `generic`, `strength`, `dosageForm`, `manufacturer` |
| `Files` | **file registry** (bytes live in Drive) | `storageKey` = Drive file id, `name`, `mimeType`, `size`, `kind`, `relatedType`/`relatedId`, `folderPath`, `ownerUserId`/`ownerEmail`, `deleted` |
| `AuditLogs` | append-only audit trail | `userEmail`, `action`, `entity`, `entityId`, `details`, `createdAt` |
| `SystemSettings` | key/value settings | `schema_version`, `backup_retention_count`, … |

*Derived* sheets (`FollowUps`, `PatientMedicalHistory`) are written by the application — edit the source (`Prescriptions`) instead.
Finalized prescriptions are immutable by design: corrections create a new row with `version + 1` and `rootId` pointing at the first version.

## PostgreSQL migration plan

1. Create tables 1:1 from the sheets (types above; `id` as `text`/`uuid` primary key; foreign keys as listed; unique on `Users.email`, `Patients.code`, `Prescriptions.code`).
2. Export each worksheet to CSV (File → Download) — or run the *Export* buttons in Admin — and `COPY` them in (order: Users, Doctors, Chambers, Patients, Prescriptions, PrescriptionMedicines, …).
3. Optionally split the JSON columns of `Prescriptions` into child tables (`prescription_complaints`, …); the application already (de)serialises them in one place (`toPrescriptionDTO` / `clinicalFieldsFromData`).
4. Implement `ServerPersistence` (or a thin REST adapter) for PostgreSQL and point the front-end to it; Drive files can stay in Drive (the `Files.storageKey` is just a string) or move to S3/GCS by swapping `FileBackend`.
