# Ressources pédagogiques — Phase 0 Audit

**Date:** 2026-08-11
**Auditor:** Claude Opus 5
**Scope:** what exists today vs. the master implementation prompt
**Status:** audit only — no code changed

> **The module is not greenfield.** A working first iteration is committed
> (`f07c797`) and **deployed to production**, with both migrations applied to
> `ikowzxluqkbmibkafsfl`. This audit measures the shipped implementation against
> the specification rather than planning from zero.

---

## 0. Blocking issue: the specification is not in the repository

The prompt names `Ressources pedagogiques.dc.html` as the product source of
truth. **It is not present** — I searched the whole tree for it and for any
`*.dc.html`. The earlier `ressources-module-spec.md` was likewise absent.

Everything below is therefore measured against the *prompt itself*, which is
detailed enough for §4 (data model), §5 (roles), §6 (file rules) and §2 (visual
target). Where the prompt is silent, I flag it rather than guess.

**This matters for Phase 15**, which asks for a section-by-section comparison
against the specification. That cannot be honestly produced from a document I
have never read. Please add the file, or accept the prompt as the reference.

---

## 1. What already exists and works

Verified in a browser (FR + AR, 1440/1024/375) and against the database.

| Area | State |
|---|---|
| DB tables `chapters`, `resources`, `resource_events` | Applied locally **and in production** |
| RLS on all three | Staff write / enrolled students read; verified with two teachers + one enrolled student |
| Private `course-resources` bucket | `public=false`, signed URLs (1h TTL), verified not anon-readable in production |
| Teacher page | `/dashboard/resources` — header, stats, search, course filter, hidden-only filter, Chapitres/Liste |
| Chapter view | Collapsible cards, resources as child rows, subject accent, count badge |
| Student page | `/dashboard/my-resources` — COURS → CHAPITRE → RESSOURCES, progress, opened/new dots |
| Create/edit chapter | Dialog on the existing `Dialog` primitive |
| Create/edit resource | File **or** link, important, allow-download, publish now / schedule |
| Upload | Supabase Storage, path `<group_id>/<uuid>/<filename>` |
| Preview drawer | PDF / image / video / audio / link, in the same `Sheet` as attendance |
| Drag & drop | Chapters within a course; resources within and **between** chapters, incl. empty ones. Optimistic + rollback. Verified against the DB before/after refresh |
| Liste view | Dense sortable table (title/size/date/downloads), folds `xl→lg→sm`, cards below 768px |
| Accessible reorder | Monter/Descendre menu retained — the touch and keyboard path |
| i18n | fr/ar/en complete; RTL verified, zero FR leakage in Arabic |
| Delete | Chapter (cascade) and resource (row then storage object) |

**Reusable, do not rebuild:** `queries.ts` (keys rooted for one-shot
invalidation), `types.ts`, `resource-icon.ts` (MIME→icon, pure), `use-drag-reorder.ts`
(pure reorder maths), `chapter-section.tsx`, `resource-list-view.tsx`,
`resource-preview.tsx`, `resource-dialogs.tsx`.

---

## 2. Two specification conflicts I must raise before changing anything (RULE 11)

### 2.1 Routes — `/teacher/resources` vs the shipped `/dashboard/*`

The prompt specifies `/teacher/resources` and `/student/resources`. The shipped
routes are `/dashboard/resources` and `/dashboard/my-resources`.

Every one of the ~30 existing routes lives under `/dashboard/*`, and
student-scoped pages already use the `my-` prefix (`my-groups`, `my-attendance`,
`my-classes`, `my-students`, `my-registrations`). A `/teacher/*` tree would be
the only one of its kind, would need its own layout shell, and would break the
sidebar's single navigation registry.

These routes are **already live in production**. Renaming them breaks any
bookmark and contradicts §3 RULE 3 (reuse existing patterns) and §8 RULE 13.

**Recommendation:** keep `/dashboard/resources` + `/dashboard/my-resources`.
**Decision needed from you** — I will not rename live URLs unilaterally.

### 2.2 Icons — Material Symbols Rounded vs Lucide

§0 and §3 both name Material Symbols Rounded. **It is not used anywhere in the
codebase** — no font link, no CSS. Lucide is imported in **78 files**, including
every page this module must sit beside.

Introducing Material Symbols for this module alone would make it the one page
with a different icon language, directly against §2 ("visual siblings") and
RULE 13.

**Recommendation:** stay on Lucide. **Decision needed.**

---

## 3. Data-model gaps (the largest real gap)

Shipped columns, compared to §4:

### Chapter
| Spec field | Shipped | Gap |
|---|---|---|
| `id`, `groupId`, `title`, `description`, `order`, `createdAt`, `updatedAt` | ✅ (`position` = order) | — |
| `subjectId` | ❌ | Derived from the group today. Blocks the subject filter and a group teaching two subjects |
| `teacherId` | ❌ | `created_by` exists but is not the same concept |
| `pinned` | ❌ | Blocks pin/unpin chapter |
| `visibility` | ❌ | Chapter-level publish/hide missing |
| `publishAt` | ❌ | Chapter scheduling missing |

### Resource
| Spec field | Shipped | Gap |
|---|---|---|
| `id`, `chapterId`, `groupId`, `title`, `description`, `kind`, `order` | ✅ | — |
| **`role`** (notes/exercises/solutions/video/homework/extra) | ❌ | **§5 calls this non-optional.** Also drives the default pedagogical ordering. Biggest single gap |
| `subjectId`, `teacherId` | ❌ | As above |
| `fileName`, `fileExt` | ❌ | Recoverable from `storage_path`, but not stored |
| `mimeType`, `sizeBytes`, `storageKey` | ✅ (`storage_path`) | — |
| `linkUrl` | ✅ (`url`) | — |
| `linkProvider`, `linkThumbnailUrl` | ❌ | Blocks Phase 6 provider detection |
| `visibility` enum | ⚠️ | Modelled as `is_published` + `published_at`. **Functionally equivalent** (three derived states) and deliberate, but not the spec's shape |
| `pinned` | ⚠️ | Shipped as `is_important` — same idea, different name |
| `allowDownload` | ✅ | — |

### ResourceEvent
| Spec | Shipped | Gap |
|---|---|---|
| `view`, `download`, `open` | `open`, `download` | **`view` missing.** Also, `UNIQUE (resource, student, kind)` makes this *current state*, not a log — so "last opened" works but a view **count** over time cannot be derived |

---

## 4. Missing functionality by phase

- **Phase 3** — pin/unpin, duplicate, publish-all, hide-all, move chapter between groups, "Non classé" fallback on delete
- **Phase 4** — pedagogical `role` selector, rich-text description (plain textarea today)
- **Phase 5** — progress %, cancel, retry, parallel (max 3), duplicate-filename Replace/Keep-both, floating upload status, **quota enforcement**. Today: single sequential upload, coarse progress, no cancel
- **Phase 6** — all provider detection (YouTube/Drive/Dropbox/OneDrive), thumbnails, titles
- **Phase 7** — duplicate resource; Office preview; `allowDownload=false` hides the button but **the signed URL is still mintable by anyone who can read the row** (see §5)
- **Phase 8** — the entire statistics panel, per-student opened/never-opened, "Relancer les élèves"
- **Phase 11** — notifications. `notification_kind` has no resource value; nothing emits
- **Phase 12** — multi-selection and bulk actions

---

## 5. Security findings

**Sound today:**
- RLS verified in both directions with real accounts; students cannot write
- Private bucket; signed URLs only; verified not anon-readable in production
- `resources.group_id` is denormalised for RLS but **derived by trigger**, never trusted from the client
- **Statistics cannot be polluted by staff** — the `resource_events` insert policy requires `student_id = auth.uid()` *and* `is_enrolled_in_group`, so a teacher physically cannot insert an event. §8's requirement is already structurally satisfied
- Students cannot forge another student's event (`student_id = auth.uid()`)

**Genuine gaps:**

1. **`allowDownload = false` is not enforced server-side.** The UI hides the
   button and the client checks the flag, but `signResourceUrl` will mint a
   download URL for any resource the caller may read. Phase 7 says "do not expose
   downloadable storage URL" — that needs an RPC or a storage-policy change, not
   a client check.
2. **No storage quota.** §6 requires 5 GB per centre; nothing enforces it. Bytes
   used are only *displayed*.
3. **File size limit is 50 MB, not 250 MB** — enforced at the bucket, so a
   250 MB upload would fail with a raw storage error rather than the specified
   French message.
4. **Allowed MIME list is short** — 15 types. Missing ZIP/RAR/7Z, XLS/XLSX, CSV,
   MOV, AVI, WAV, M4A, SVG. An upload of those is rejected by the bucket today.

---

## 6. Architecture risks

1. **Adding `subjectId` / `teacherId` / `role` touches the live table.** All are
   additive (`ALTER TABLE … ADD COLUMN`), and `role` needs a backfill default
   (`extra` is the safe choice). Production already holds rows.
2. **`visibility` enum vs the two-boolean model.** Converting is a destructive
   column change on live data for no behavioural gain. **Recommend keeping the
   current shape** and mapping it to the spec's three states at the type layer,
   as `visibilityOf()` already does.
3. **`view` events break the UNIQUE state model.** Counting views over time
   requires either dropping the UNIQUE (unbounded growth) or adding a counter
   column. Needs a decision.
4. **Statistics with 2 000+ students.** The teacher page already fetches events
   per chapter; a per-student opened/never-opened panel needs an aggregate view,
   as attendance needed in Phase 2A. Do not fetch raw event rows.

---

## 7. Recommended implementation order

Reordered from the prompt so that schema changes land once, and the two
security gaps are not left open behind new UI.

| # | Work | Why here |
|---|---|---|
| **1** | **Schema additions** — `role`, `subjectId`, `teacherId`, `pinned`, chapter visibility, `fileName`/`fileExt`, `linkProvider`/`linkThumbnailUrl`; raise the bucket to 250 MB and widen MIME | One migration instead of six. Everything below depends on it |
| **2** | **Security closure** — server-side `allowDownload`, 5 GB quota, the specified size-limit message | Open gaps should not sit behind more features |
| **3** | **Pedagogical `role`** in the dialog + default ordering | §5 calls it non-optional; highest product value |
| **4** | Chapter management (pin, duplicate, publish-all, hide-all, move, Non classé) | Pure UI on the new columns |
| **5** | Upload system (progress, cancel, retry, parallel, duplicates, floating status) | Self-contained |
| **6** | External-link providers | Needs `linkProvider`/`linkThumbnailUrl` from step 1 |
| **7** | Statistics (aggregate view + panel) | Needs an aggregate view; do not read raw events |
| **8** | Notifications | Reuse the existing system; add the enum value |
| **9** | Bulk actions in Liste | Liste already exists |
| **10** | Responsive/UX polish, then tests, then final audit | Last |

Phases 2, 9, 10, 12, 13 from the prompt are **already largely done** — see §1.

---

## 8. Answers to the report questions

**Current status.** A working, deployed first iteration: chapter-first hierarchy,
both portals, upload, preview, drag & drop, Liste, RLS, private storage, three
locales with RTL. Roughly the prompt's Phases 1, 2, 9, 12, 13 plus parts of 3–7.

**Biggest gaps.** In order: the pedagogical `role` field (§5, non-optional);
statistics (Phase 8, entirely absent); notifications (Phase 11, entirely absent);
the upload system's robustness (Phase 5); provider detection (Phase 6).

**Architecture risks.** Additive columns on a live table; the `visibility` enum
conversion I recommend *against*; `view` events conflicting with the UNIQUE state
model; statistics needing an aggregate view rather than raw event reads.

**Security risks.** `allowDownload` unenforced server-side; no storage quota;
50 MB vs 250 MB; short MIME list. None is a data-exposure hole today — the first
is the only one that lets a user obtain something the UI intended to withhold.

**First implementation task.** One additive migration adding `role` (default
`extra`), `subject_id`, `teacher_id`, `pinned` to `resources`; `subject_id`,
`teacher_id`, `pinned`, `visibility`, `publish_at` to `chapters`; `file_name`,
`file_ext`, `link_provider`, `link_thumbnail_url` to `resources`; raising the
bucket to 250 MB and widening `allowed_mime_types` to the §6 list. No column
removed, no data rewritten, verified locally before production.

---

## 9. Decisions I need before Phase 1

1. **Routes** — keep `/dashboard/resources` + `/dashboard/my-resources`, or
   rename to `/teacher/*` + `/student/*` and break the live URLs?
2. **Icons** — stay on Lucide, or introduce Material Symbols for this module?
3. **`visibility`** — keep `is_published` + `published_at` (recommended), or
   convert to the enum on live data?
4. **`view` events** — add a counter column, or drop the UNIQUE and accept an
   append-only log?
5. **The specification file** — can you add `Ressources pedagogiques.dc.html`?
   Phase 15 cannot be done honestly without it.
