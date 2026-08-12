# Ressources pédagogiques — Task Tracking

Companion to `RESOURCE_MODULE_AUDIT.md`. Order follows the audit's §7, which
reshuffles the prompt's phases so schema changes land once and the two open
security gaps close before more UI sits on top of them.

**A box is only ticked when the behaviour is verified — never because the UI
exists** (RULE 8).

Legend: `[x]` verified · `[~]` partially done · `[ ]` not started

**Numbering warning.** The phase numbers below are the ORIGINAL master-prompt
numbering. They do not line up with the module's delivery phases: the work shipped as
module Phase 3 closed most of tracker Phases 4, 7 and 12, and module Phase 4 closed
tracker Phases 8 and 11. Where an item is done, the delivering phase is named.

Reports: `RESOURCE_MODULE_PHASE1_REPORT.md`, `RESOURCE_MODULE_PHASE3_REPORT.md`,
`RESOURCE_MODULE_PHASE4_REPORT.md`.

---

## Phase 0 — Audit
- [x] Audit existing architecture (TanStack Start/Router/Query, Supabase, RLS, Storage)
- [x] Audit existing resources implementation (3 646 lines across 10 files)
- [x] Audit database (columns, enums, indexes, triggers, bucket limits)
- [x] Audit RLS (verified both directions with real accounts)
- [x] Audit storage (private bucket, signed URLs, verified in production)
- [x] Audit UI (FR + AR, 1440/1024/375, both portals)
- [x] Audit notifications (`notification_kind` has no resource value; nothing emits)
- [x] Create implementation plan
- [ ] **Await decisions on the 5 open questions (audit §9)**

---

## Phase 1 — Schema, security & storage foundation — **COMPLETE**
Three migrations, applied in filename order:
`20260811095000_resource_event_kind_view.sql` (one statement, must commit first),
`20260811100000_resources_phase1_foundation.sql` (additive; row counts unchanged),
`20260811110000_resources_drop_is_important.sql` (separate, ordering-sensitive).
**43/43 API checks and 21/21 browser checks pass**, and the chain was replayed
transactionally on a clone rewound to production shape.

### Schema
- [x] `resources.role` enum, default `extra` — defaulted, not guessed from filenames
- [x] ~~`subject_id` / `teacher_id`~~ — **deliberately not added.** `groups` already carries both and a group has exactly one of each, so a copy would always equal it (report §2)
- [x] `resources.file_name`, `resources.file_ext` — backfilled, then **kept true by `resources_sync_file_meta`**; without the trigger every new upload would have downloaded as its storage UUID
- [x] `resources.link_provider`, `resources.link_thumbnail_url` — for Phase 6
- [x] `resources.pinned` — backfilled from `is_important`
- [x] `chapters.pinned`, `chapters.is_published`, `chapters.published_at` — two-field shape, not an enum; existing chapters default to published
- [x] Resource events **append-only**: UNIQUE dropped, `view` added, `open` migrated, no update/delete policy
- [x] Bucket `file_size_limit` 50 MB → 250 MB; client dialog aligned (it was still 50 MB) with the specified fr/ar/en message
- [x] MIME list widened 15 → 28 types
- [x] Indexes for the new filters and the event log
- [x] Existing rows preserved (4 chapters, 7 resources before and after)
- [x] **Fixed a push-blocking bug**: `alter type ... add value` and the `update` that used it were in one file, which `supabase db push` runs in one transaction — Postgres refuses to use a new enum value before its transaction commits. Data-dependent, so it passed on an empty table. Split into its own migration and reproduced/re-verified on a clone (report §8)
- [x] Chain replayed one transaction per file on a clone rewound to production shape — no partial application, all data preserved
- [x] Rehearsal extended through the deploy window (push, push, new bundle writes `pinned`, then drop) — all four steps commit, row counts unchanged
- [x] Release audit: production confirmed at `20260810130000` with all nine Phase 1 columns absent; only one destructive statement in the whole phase and it is in the migration held back; no service-role key or server module in the client bundle; production build succeeds
- [x] `RESOURCE_MODULE_PHASE1_REPORT.md`
- [ ] **Apply to production** — not done, awaiting instruction. Order: `…100000` with the code, `…110000` only once the code is live (report §6)

### Security closure
- [x] `allowDownload` enforced **server-side** — `can_download_resource()` is the authority, asked as the *caller*; attachment set only for an authorised download
- [x] **Server path wired into the real call sites** — `UI → queries.ts → server fn → user-scoped DB check → Storage`; four signing sites plus upload
- [x] Verified in the browser: preview URLs are signed with **no** attachment; download URLs are signed **and** attachments; the quota check runs on the server during a real upload
- [x] Verified: student denied download while **still able to preview**; owning teacher and admin unaffected; unrelated teacher denied; the database refuses even when the button is bypassed
- [x] 5 GB quota **enforced**, measured from `storage.objects` so it stays accurate and external links cost nothing
- [x] Verified: 6 GB upload refused, small upload allowed
- [x] RLS updated so a hidden chapter hides its resources (AND rule) — verified both directions, and no event can be logged against a hidden chapter either
- [x] Verified: student cannot view hidden or scheduled resources, cannot create resources or chapters, cannot modify another teachers resource

### Event log
- [x] **Students can record events.** The earlier `42501` was the verification script deleting its own student mid-run through a global `cleanupFixtures()` — the policy was correct all along (report §0)
- [x] `can_record_resource_event` requires enrolment **AND** `can_view_resource`, closing the gap the SECURITY DEFINER helper would otherwise have opened
- [x] A `download` event requires download rights, so a preview-only student cannot inflate download counts
- [x] Append-only: no UPDATE policy, so a `view` cannot be rewritten into a `download`; no DELETE
- [x] Verified: teacher cannot write an event at all — staff activity cannot enter student analytics
- [x] Fixed two client bugs the dropped UNIQUE would have shipped: the upsert (`42P10` on every write) and the `kind = 'open'` view count
- [x] Verified end to end in the browser: a student opening a resource increments their `view` count

### `pinned` standardisation
- [x] Every call site audited (13 in the module, 2 in routes) and migrated to `pinned`
- [x] No application code, policy, index, view, function, constraint or trigger depends on `is_important`; `pinned` matched it on every row
- [x] Separate migration prepared and applied locally, with a guard and a documented reversal — **not** folded into the Phase 1 migration
- [x] Guard corrected after a release rehearsal: it required `pinned` and `is_important` to still agree, which the deployment order makes false (the new bundle writes `pinned` only), so it would have blocked the drop at exactly step 4. It now requires only that `pinned` exists and reports divergence

---

## Phase 3 — Pedagogical role (§5)
- [ ] Role selector in the create/edit dialog
- [ ] Default ordering notes → exercises → solutions → video → homework → extra
- [ ] Manual drag order overrides the default
- [ ] Role visible on teacher rows and student rows
- [ ] i18n fr/ar/en for all six roles

---

## Phase 4 — Chapter management
- [~] Create chapter dialog — **done**
- [~] Edit / rename — **done**
- [~] Delete + confirmation — **done** (cascade)
- [~] Drag-and-drop ordering, optimistic + rollback — **done, verified**
- [~] Chapter empty state — **done**
- [~] Chapter-specific add-resource entry — **done**
- [x] Pin / unpin — **Phase 3**, pinned chapters sort first for students
- [x] Duplicate chapter — **Phase 3**, copies its resources, starts hidden, bucket-side file copy
- [x] Publish all / hide all — **Phase 3**, publishing clears pending schedules
- [ ] Move chapter to another group — **not done**, needs reparenting; the destination cascade exists if it is ever wanted
- [x] "Move resources to Non classé" on delete — **Phase 3**, reparents BEFORE deleting
- [x] Verify permissions for every new operation — **Phase 3**, 39 API checks

---

## Phase 5 — Upload system
- [~] File picker + Supabase Storage — **done**
- [x] Client-side type/size validation — 250 MB and the widened MIME list, aligned with the bucket and the server
- [ ] Drag-and-drop onto the dialog
- [ ] Real progress per file
- [ ] Parallel uploads, max 3
- [ ] Cancel an in-flight upload
- [ ] Retry a failed upload
- [ ] Duplicate filename → Replace / Keep both
- [ ] Floating upload status that survives closing the dialog
- [ ] Quota display driven by the Phase 1 enforcement (the enforcement exists; the display does not)

---

## Phase 6 — External links
- [~] Link kind + URL validation (https only) — **done**
- [ ] Provider detection: YouTube / Drive / Dropbox / OneDrive / Other
- [ ] YouTube title + thumbnail where available
- [ ] Provider-appropriate preview

---

## Phase 7 — Resource actions & preview
- [~] Preview: PDF, image, video, audio, link — **done**
- [~] Edit — **done**
- [~] Delete — **done** (row then storage object)
- [x] Duplicate resource — **Phase 3**, new id, no inherited events, starts hidden
- [ ] Office preview where technically possible
- [ ] ZIP/RAR download-only path
- [ ] "Lecture en ligne uniquement" when `allowDownload = false` — the enforcement exists (Phase 1); the label does not

---

## Phase 8 — Statistics
- [x] Aggregate views — **Phase 4**: `resource_engagement` and `resource_student_engagement`, staff-gated, never raw rows
- [x] `view` event type + append-only model — **Phase 1**
- [x] Panel: views, distinct students, downloads, last opened — **Phase 4**
- [x] Students who opened / never opened — **Phase 4**, not-opened listed first
- [ ] "Relancer les élèves" — the list exists; sending the reminder does not
- [x] Staff activity cannot pollute student statistics — **structural**: the insert policy requires `is_enrolled_in_group`, which no staff member satisfies. Verified with live accounts (the earlier pass ran against deleted ones)
- [x] `view` event type exists and the log is append-only, so counts are real counts
- [x] Event recording works — this was the blocker, and it is cleared

---

## Phase 9 — Student portal
- [~] `/dashboard/my-resources`, chapter-first by default — **done**
- [~] Chapitres / Tout toggle — **done**
- [~] Search, unopened filter — **done**
- [~] Per-chapter and per-course progress — **done**
- [~] Opened / new indicators — **done**
- [~] Important + recent rails — **done** (gated above 6 resources so they do not repeat the outline)
- [~] Authorised resources only — **done, verified**: hidden and scheduled do not leak
- [ ] Subject / teacher / file-type / sort filters
- [x] Pinned chapters first, pinned resources in "Important" — **Phase 3**

---

## Phase 10 — Student preview
- [~] PDF, image, video, audio — **done**
- [ ] YouTube embed (no external redirect)
- [ ] Image lightbox
- [ ] Office preview where available
- [ ] Video resume position
- [x] Respect `allowDownload` — enforced by the server, verified in the browser

---

## Phase 11 — Notifications
- [x] `resource_published` / `chapter_published` added to `notification_kind` — **Phase 4**, own migration (the split is load-bearing: partial index predicates read the enum)
- [x] Emit on publish — **Phase 4**, database triggers on the existing notifications table, not a second system
- [x] Scheduled publication fires at `publishAt` — **Phase 4**, via `deliver_at` enforced in RLS. No scheduler, no drift, no double delivery
- [x] Chapter published — **Phase 4**
- [ ] Teacher reminder ("Relancer") — the "who has not opened it" list exists; sending is not built
- [ ] Digest: >3 in one chapter within an hour → "5 nouveaux documents dans …" — `deliver_at` makes it possible; what a student should see is a product decision

---

## Phase 12 — Liste view & bulk actions
- [x] Dense sortable table, distinct from Chapitres — **done, verified**
- [x] Columns: Ressource, Groupe, Chapitre, Taille, Ajouté le, Téléch., Visibilité, Actions
- [x] Sorting on title, size, date, downloads
- [x] Tablet/mobile fold to cards
- [x] Multi-selection — **Phase 3**, select one / all visible / clear
- [x] Bulk publish / hide / move / delete — **Phase 3**, one `.in()` statement so RLS filters what the caller may touch

---

## Phase 13 — Responsive & UX polish
- [x] 1440 / 1024 / 375 verified, FR + AR, no horizontal overflow
- [x] Actions reachable at every width
- [x] Drag handles hidden on mobile with the menu fallback present
- [ ] Mobile dialogs as full-screen bottom sheets
- [ ] Chapters collapsed by default on mobile
- [ ] Verify 44px minimum touch targets by measurement

---

## Phase 14 — Testing & security audit
- [ ] Chapter creation, resource creation
- [ ] Visibility: published / hidden / scheduled
- [ ] Student access + unauthorised access
- [ ] Teacher and admin authorisation
- [ ] `allowDownload` enforcement
- [ ] 250 MB limit
- [ ] Progress and statistics
- [ ] Notification behaviour
- [ ] Chapter and resource ordering
- [ ] Security: hidden/scheduled resource direct access **must fail**
- [ ] Security: another group's resource as a student **must fail**
- [ ] Security: create as a student **must fail**
- [ ] Security: modify another teacher's resource **must fail**

*(Partially covered already: RLS in both directions, no hidden/scheduled leakage,
student writes refused — all verified during the first iteration.)*

---

## Phase 15 — Final audit
- [ ] `RESOURCE_MODULE_FINAL_AUDIT.md`
- [ ] **Blocked:** needs `Ressources pedagogiques.dc.html`, which is not in the repo
