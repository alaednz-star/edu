# Ressources pédagogiques — Phase 1 Report

**Date:** 2026-08-11
**Migrations:** `20260811095000_resource_event_kind_view.sql`,
`20260811100000_resources_phase1_foundation.sql`,
`20260811110000_resources_drop_is_important.sql`
**Applied to:** local only. **NOT pushed to production.**
**Status:** complete. **43/43 API checks and 21/21 browser checks pass.**

---

## 0. Correction to the previous report

The last version of this report said students could never record a resource event,
that the cause was the RLS policy shipped in `20260810120000`, and that the failure
was pre-existing. **That was wrong on all three counts, and the real cause was my
own verification script.**

`withFixtures().cleanup()` delegates to `cleanupFixtures()`, which deletes **every**
`e2e-fixture%` account in the database — not just the handle it was called on. The
suite called it mid-run to tidy away a secondary teacher:

```js
await foreign.cleanup();          // deletes EVERY fixture account, including fx.student

console.log("--- append-only events + statistics ---");
await asUser(sTok, "resource_events", { ... });   // 42501
```

Deleting the auth user cascades `auth.users → profiles → students → registrations`,
so by the time the events section ran the student had no approved enrolment.
`is_enrolled_in_group` returned false and the policy refused the insert — **exactly
as designed**. The token was still valid, which is why it looked like an
authorisation bug rather than a missing row.

Verified both ways against a persistent fixture: the **original** predicate from
`20260810120000` accepts a genuinely enrolled student, and so does the current one.
Nothing was ever broken in production.

Two consequences worth recording:

1. **Two checks in the old run passed for the wrong reason.** "Student cannot forge
   another user's event" and "teacher cannot write an event" both ran against
   deleted accounts, so they would have passed whatever the policy said. Both are
   now re-verified with live accounts.
2. **The `is_enrolled_in_group` half is load-bearing**, and it is what keeps staff
   out of student analytics — worth knowing before Phase 8 leans on it.

`fixtures.mjs` now carries a warning at the point where the mistake was made, and
the new suite calls `cleanup()` exactly once, in `finally`.

---

## 1. Schema changes

All additive. No column dropped in this migration, no row rewritten. Row counts
before and after are identical (4 chapters, 7 resources).

### `resources`
| Column | Type | Notes |
|---|---|---|
| `role` | `resource_role` enum, NOT NULL, default `extra` | notes / exercises / solutions / video / homework / extra |
| `pinned` | boolean, default false | Backfilled from `is_important` |
| `file_name` | text | Backfilled from `storage_path`, then kept by a trigger |
| `file_ext` | text | Same, lowercased |
| `link_provider` | text | For Phase 6 |
| `link_thumbnail_url` | text | For Phase 6 |

### `chapters`
| Column | Type | Notes |
|---|---|---|
| `pinned` | boolean, default false | |
| `is_published` | boolean, default **true** | Existing chapters stay visible — their resources are already live |
| `published_at` | timestamptz | |

### `resource_events`
- `UNIQUE (resource_id, student_id, kind)` **dropped** → append-only log
- `view` added to `resource_event_kind`; existing `open` rows migrated to it
- `open` remains in the enum (Postgres cannot remove an in-use value) but nothing
  writes it, and `ResourceEventKind` in TypeScript no longer offers it
- **No UPDATE and no DELETE policy** — insert-only for students

### Functions and triggers
`resource_role_weight`, `center_storage_bytes`, `center_storage_quota_bytes`,
`storage_quota_allows`, `can_view_resource`, `can_download_resource`,
`can_record_resource_event`, `resources_sync_file_meta` (+ its trigger).

### Indexes
`idx_resources_chapter_role`, `idx_resources_pinned` (partial),
`idx_chapters_pinned` (partial), `idx_resource_events_resource_kind`,
`idx_resource_events_student_kind`.

---

## 2. Scope decisions, with reasons

### `subject_id` / `teacher_id` were NOT added

They were on the Phase 1 list, but instruction §11 asked me to check for existing
equivalents first. `groups` already carries both, and a group has exactly **one**
subject and **one** teacher — so a chapter's copy would always equal its group's.
That is duplication with a staleness risk (retarget a group's subject and every
copy goes stale) for no added capability. Filtering and authorisation already work
through the join the queries perform (`groups!inner(subjects(...))`).

**If a group ever needs to span two subjects, this decision must be revisited** —
that is the only case where the columns would earn their place.

### Chapter publication uses two fields, not an enum

Keeping the existing `is_published` + `published_at` model means both tables derive
their three states identically through one helper, instead of a `visibility` enum
on one table and a pair of booleans on the other.

Semantics are **AND**, chosen as the only rule that cannot confuse: a hidden or
not-yet-due chapter hides its resources whatever their own state says.

### A trigger, not a convention, keeps `file_name` true

The backfill fixes today's rows; nothing was keeping tomorrow's correct. Every new
upload would have arrived with a null `file_name`, and the download path — which
uses it for `Content-Disposition` — would have quietly fallen back to the storage
UUID, so students would save files called `9f3c…pdf`. `resources_sync_file_meta`
derives both columns from `storage_path` on insert and on any change to
`storage_path` or `kind`, and nulls them for a link. Same shape as the existing
`resources_sync_group`, which derives `group_id` from the chapter for the same
reason. **Found by a verification check failing, not by inspection.**

---

## 3. Security: `allow_download` is enforced, and the app now asks

This was the critical fix, and it is complete end to end.

**The database is the authority.** `can_download_resource(uuid)` and
`can_view_resource(uuid)` answer for the *caller*: staff managing the group always
may; a student needs enrolment, a live chapter, a live resource, and — for a
download — `allow_download = true`.

**The server asks it.** `storage.server.ts` holds the service role but evaluates
the question through a **user-scoped client**, never as the service role, which
would authorise everything. Only then does it mint a URL, and
`Content-Disposition` is set **only** for an authorised download — a student denied
download never receives an attachment URL at all.

**The application goes through it.** This was the gap left open last time.
`signResourceUrl` in `queries.ts` used to call Supabase Storage from the browser;
it now takes a resource ID and an intent and returns whatever the server issues:

```
UI → queries.ts → storage.functions.ts (server fn) → user-scoped DB check → Storage
```

Four call sites changed (teacher preview, teacher download, student preview,
student download). `uploadResourceFile` now asks `assertUploadAllowedFn` before a
byte moves, so the per-file limit and the centre quota are decided server-side too.
`storage.functions.ts` imports the server module *inside* each handler, so the
service-role client stays out of the browser bundle — the discipline
`provisioning.functions.ts` documents.

**Honest limit, unchanged:** preview and download read the same bytes. A student
who may preview a PDF can always save what their browser renders. `allow_download`
is enforceable as "no attachment URL is issued", which is what the requirement
asks; it is not and cannot be a guarantee that bytes are unreachable.

### RLS updated for chapter publication

`resources read`, `chapters read` and the storage read policy all apply the AND
rule. Without this, a resource inside a hidden chapter stayed readable and chapter
publication would have been cosmetic.

---

## 4. Security: the event log

`can_record_resource_event` is not a bug fix (see §0) — it closes a gap the
`SECURITY DEFINER` helper would otherwise have **opened**, and tightens two things.

1. The original predicate ran its subquery under the caller's RLS on `resources`,
   so recording an event implied being able to read the row. A `SECURITY DEFINER`
   helper bypasses that — enrolment alone would have sufficed, and a student could
   have logged an event against a resource hidden from them. The helper therefore
   requires enrolment **and** `can_view_resource`, keeping the visibility rule in
   one place rather than a fifth copy.
2. A `download` event additionally requires download rights. Without it a student
   who may only preview could inflate a teacher's download count.
3. The UPDATE policy is **dropped**. The log is append-only, and an update would
   have let a student rewrite a `view` into a `download` after the fact, defeating
   (2). There was never a DELETE policy, so the table is now insert-only for
   students.

Staff cannot write events at all, because enrolment is what makes a caller a
student of the group — so **teacher and admin activity cannot enter student
analytics**, structurally rather than by filtering later.

### Two application bugs this phase would otherwise have shipped

Dropping the UNIQUE constraint broke the client that depended on it, and neither
failure would have been visible:

- `useRecordResourceEvent` **upserted** with `onConflict: "resource_id,student_id,kind"`.
  With no matching unique index that is `42P10` on **every** write — and the hook
  deliberately swallows failures, so progress would silently never record. It is
  now a plain insert.
- `useCourseResources` counted events with `.eq("kind", "open")`. Every row is now
  `view`, so teacher-facing view counts would have read 0 forever.

Both are verified in the browser: opening a resource as a student increments that
student's `view` count in the database.

---

## 5. Storage

- Per-file limit **50 MB → 250 MB** (`262144000`), on the bucket, in
  `storage.server.ts`, and in the dialog's own fast check — which was still 50 MB
  and is now aligned, with the specified message in fr/ar/en:
  *"Ce fichier dépasse 250 Mo. Compressez-le ou partagez un lien Drive."*
- MIME list widened **15 → 28** types: XLS/XLSX, CSV, ZIP/RAR/7Z (both common
  content types each), SVG, MOV, AVI, WAV, M4A
- Bucket remains `public = false`

### Quota — 5 GB, enforced

- `center_storage_bytes()` sums `storage.objects.metadata->>'size'` for the bucket
- Measured from **objects, not `resources.size_bytes`**: objects are what actually
  consume the quota, and it stays correct if a row is deleted while its object
  lingers
- **External links consume nothing** — they create no object, so this is correct by
  construction rather than by a special case
- `assertUploadAllowed()` refuses an upload that would exceed the quota, with the
  remaining megabytes in the message, and the real upload path now calls it

---

## 6. `pinned` is the only importance flag

`pinned` is canonical, per the specification. The audit and migration were done in
the order asked:

1. Every call site found — 13 in the resources module, 2 in routes
2. All reads and writes moved to `pinned`; the domain field in `types.ts` renamed
3. No application code references `is_important` (verified by search, zero hits
   outside generated types)
4. No policy, index, view, function, constraint, trigger or generated column
   references it (verified against the migrated database, zero rows), and `pinned`
   equals `is_important` on **every** row
5. Only then, a **separate** migration drops it:
   `20260811110000_resources_drop_is_important.sql`

The drop is not in the Phase 1 migration, and it documents its own reversal, which
is possible precisely because the data survives in `pinned`.

Its guard requires only that `pinned` exists. An earlier version *also* refused to
run while the two columns disagreed, which sounded prudent and was wrong: between
the two migrations the new bundle goes live and writes `pinned` only, so every
resource pinned in the interim leaves `is_important` stale. Divergence is the
expected state at the moment this migration runs, not a fault — `pinned` is
canonical and `is_important` is a legacy column nothing reads. The old guard would
have blocked the drop at exactly the step the deployment order requires. Caught by
rehearsing the deployment rather than reasoning about it (§8), and the migration now
*reports* the divergence instead of refusing.

**⚠ Deploy ordering:** apply `20260811110000` only **after** the Phase 1
application code is live. Both halves are in the same commit, but if the migration
reaches the database before the new bundle reaches browsers, a teacher still
running the old JavaScript sends `is_important` on create and gets a 400. The
window is one deploy, and the safe order costs nothing.

---

## 7. Verification

### API — 43 checks, 0 failures
`node scripts/e2e/verify-resources-phase1.mjs` (`--keep` leaves the fixture in
place for hand-probing). Four real roles: owning teacher, unrelated teacher, admin,
enrolled student.

- **Schema & integrity (11)** — all new columns; `is_important` gone; UNIQUE
  dropped; no update/delete policy on the event log; no `open` rows; every resource
  has a role; `file_name` present for every stored file; bucket 250 MB; 28 MIME
  types; quota 5 GB
- **`allow_download` (6)** — student can download an allowed resource; cannot when
  `allow_download = false`; **can still view it**; owning teacher and admin can
  regardless; unrelated teacher cannot
- **Visibility (3)** — student cannot view hidden, cannot view scheduled before
  `publishAt`, cannot download hidden
- **Chapter AND rule (5)** — hiding the chapter hides a published resource, stops
  RLS listing it, hides the chapter, **and blocks events against it**; republishing
  restores access
- **RLS & authorisation (4)** — cross-group view refused; student cannot create a
  resource (403) or a chapter (403); unauthorised teacher cannot modify another's
- **The event log (11)** — student **can** record a view; three views produce three
  rows; can record an allowed download; **cannot** record a download when
  `allow_download = false` but **can** still record a view of it; cannot record for
  a hidden resource; cannot forge another user's event; teacher cannot write at
  all; student can read their own events; cannot rewrite a view into a download;
  cannot delete
- **Quota (3)** — small upload allowed; 6 GB refused; links consume 0 bytes

### Browser — 21 checks, 0 failures
`node scripts/e2e/verify-resources-phase1-ui.mjs`, against the running app.
This is what proves the *application* asks the database, not just that the database
would answer correctly.

- **Teacher (5)** — chapter and both resources render, no error state, preview URL
  is a signed storage URL, and a server-function POST was observed on the wire
- **Upload (4)** — a real PDF uploads through the dialog, the quota check runs on
  the server, `file_name`/`file_ext` are populated by the trigger, and the bytes
  reach the private bucket
- **Student (8)** — sees the chapter and published resources; preview is signed and
  carries **no** attachment disposition; **opening a resource records a view**;
  download is offered and its URL is signed *and* marked as an attachment; a
  no-download resource still previews; no download button is offered for it; and
  the database refuses it too, so hiding the button is not the control
- **Unauthorised (1)** — a teacher of another group sees none of it
- **Admin (1)** — sees the resources

Both suites clean up after themselves, including storage objects — which have to go
through the Storage API, since `storage.protect_delete()` refuses a direct DELETE.

### Migration chain
Replayed on a clone rewound to production's shape, one transaction per file — §8.

### Toolchain
TypeScript clean. ESLint clean on every file this phase touched. Existing **95**
unit tests pass.

One environmental note so the numbers are not misread: `core.autocrlf=true` gives
CRLF working-tree files while Prettier's `endOfLine` default is `lf`, so a
repo-wide `eslint` run reports ~7 300 `Delete ␍` messages on files nobody has
touched. Excluding that rule, the 141 remaining findings are all pre-existing
(formatting drift in older `scripts/e2e/*.mjs`, `react-refresh` warnings in shadcn
components, `exhaustive-deps` in `student-portal.ts`) and **zero** are in files
changed this phase.

---

## 8. A bug that would have broken the production push

Found by inspection while checking whether the migration chain replays cleanly,
then reproduced, fixed, and re-verified. **It would have failed the very push this
phase is preparing for.**

The migration added `view` to `resource_event_kind` and then, a few statements
later, migrated existing `open` rows to it:

```sql
do $$ begin
  alter type public.resource_event_kind add value if not exists 'view';
exception when others then null; end $$;
...
update public.resource_events set kind = 'view' where kind = 'open';
```

Postgres allows adding an enum value inside a transaction but refuses to let it be
**used** until that transaction commits, and `supabase db push` runs each migration
file in one transaction:

```
ERROR:  unsafe use of new value "view" of enum type resource_event_kind
HINT:   New enum values must be committed before they can be used.
```

Three things made this easy to miss, and worth recording:

1. **It is data-dependent.** The check is evaluated per row, so a no-op update
   passes. Verified both ways: with zero matching rows the statement succeeds; with
   one `open` row it fails. A migration that works on an empty table and breaks on
   real data is the worst shape this class of bug comes in.
2. **Local application hid it.** I had applied the file in sections through `psql`,
   which does not wrap them in a single transaction. The hazard only exists under
   the transaction `db push` adds.
3. **The `exception when others then null` would have hidden a genuine failure**
   of the `ALTER TYPE` itself, leaving a later statement to fail somewhere less
   obviously connected. `if not exists` already makes the statement safe to re-run,
   so the handler bought nothing and cost clarity.

**The fix:** the one statement moves into its own migration,
`20260811095000_resource_event_kind_view.sql`, which commits before the next file
runs. The main migration now *guards* instead of assuming — if the value is absent
it raises a message naming the migration to apply, rather than failing with a bare
"invalid input value".

### Verified by replaying the chain, not by reasoning about it

`supabase db reset` was not an option: there is no seed file, so a reset would
destroy the local dev dataset with no way to restore it. Instead I cloned the local
database (`pg_dump`/`pg_restore` into a throwaway `phase1_check`), rewound it to its
pre-Phase-1 shape, and **rebuilt `resource_event_kind` as `('open','download')`** —
because the rewind cannot remove an enum value, and without that step the test is
vacuous: `add value if not exists` becomes a no-op and nothing fails. My first
attempt at this test *did* pass for exactly that reason, which is worth stating
plainly.

On that faithful clone, with 4 chapters, 7 resources and one `open` event:

| | Result |
|---|---|
| Pre-fix, all in one transaction | **ERROR: unsafe use of new value "view"** — whole migration rolled back, nothing partially applied |
| Fixed chain, one transaction per file, filename order | **All three commit.** 4 chapters, 7 resources, 1 event preserved; no `open` rows left; `is_important` gone; 6 new columns; 0 UNIQUE constraints; 0 update/delete policies on the log; bucket at 262144000 |

The clone and its dump were then removed, and the working local database was
re-verified: 43/43 and 21/21 still pass.

### The rehearsal was then extended through the deploy window

Replaying the two deployable migrations was not enough, because the risky moment is
between them. The rehearsal now simulates the whole sequence on a clone rewound to
production's shape — enum `('open','download')`, `is_important` present, none of the
nine new columns, one `open` event:

| Step | Result |
|---|---|
| push `…095000` | commits |
| push `…100000` | commits. `is_important` **still present**, so a stale bundle keeps working |
| new bundle goes live and pins a resource, writing `pinned` only | 1 row where `is_important` is now stale |
| push `…110000` | commits, reporting "1 of 8 resources had already diverged, as expected" |

Row counts across the whole sequence: chapters 4, registrations 1, groups 25,
attendance 0, events 1 — unchanged throughout. Policies on `resources`: 2 before,
2 after.

**This is what caught the guard defect described in §6.** The first run of this
rehearsal failed at the last step with
`ERROR: 1 resources disagree between pinned and is_important` — my own guard
refusing the migration at the only point it is meant to run.

The rehearsal is committed as `scripts/e2e/rehearse-resources-phase1-release.sh`
(with its rewind and enum-rebuild companions). It never connects to production — it
clones the local database, rewinds the clone, and drops it afterwards. Worth
re-running if either migration is edited.

---

## 9. Known limitations

1. **`role` is in the schema but not in the UI.** No selector, no ordering yet —
   Phase 3.
2. **`link_provider` / `link_thumbnail_url` are unused** until Phase 6.
3. **Chapter `is_published` is not editable** in the UI; columns and RLS are ready,
   the controls are Phase 4.
4. **`pinned` on chapters is unused** until Phase 4 adds pin/unpin.
5. **The upload dialog still uploads serially with a faked progress fraction.**
   Real per-file progress, parallel uploads, cancel and retry are Phase 5. The
   quota and size rules it enforces are real; the progress bar is not.
6. **Preview cannot prevent saving.** §3 — inherent, not a gap in the
   implementation.

---

## 10. Files

**Migrations**
- `supabase/migrations/20260811095000_resource_event_kind_view.sql` *(one statement,
  its own file — §8)*
- `supabase/migrations/20260811100000_resources_phase1_foundation.sql`
- `supabase/migrations/20260811110000_resources_drop_is_important.sql` *(separate,
  ordering-sensitive — §6)*

**New**
- `src/features/school/resources/storage.server.ts` — privileged, server-only
- `src/features/school/resources/storage.functions.ts` — the boundary
- `src/integrations/supabase/access-token.ts` — moved out of `features/teachers`,
  since the resources module needs it too
- `scripts/e2e/verify-resources-phase1.mjs`
- `scripts/e2e/verify-resources-phase1-ui.mjs`

**Changed**
- `queries.ts` (server-routed storage, append-only events, `pinned`),
  `types.ts`, `resource-dialogs.tsx` (250 MB, `pinned`), `resource-preview.tsx`,
  `resource-list-view.tsx`, `chapter-section.tsx`,
  `dashboard.resources.tsx`, `dashboard.my-resources.tsx`,
  `dashboard.teachers.tsx` (import path), `i18n/dicts/resources.ts`,
  `scripts/e2e/fixtures.mjs` (teardown warning), `integrations/supabase/types.ts`
  (regenerated)

---

## 11. Not done, deliberately

**Phase 1 is not in production.** Nothing has been pushed. When it is, migrations
run in filename order, which is now also the *required* order:

1. `20260811095000` — adds the enum value and commits (§8)
2. `20260811100000` — the foundation, alongside the application code
3. `20260811110000` — only once the new code is live in browsers (§6)

Phase 2 has not been started.
