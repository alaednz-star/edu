# Ressources pédagogiques — Phase 3 Report

**Date:** 2026-08-12
**Branch:** `resources/phase1-foundation` (not merged, not deployed)
**Database changes:** **none.** Phase 3 is entirely application code.

---

## 1. What Phase 3 added

Phase 1 made the module safe, Phase 2 made the hierarchy explicit. Phase 3 makes it
operable: a teacher can arrange a whole course without leaving the page.

### Chapter management
Create, rename, reorder, **pin**, **publish**, **hide**, **duplicate**, delete.
Pinning and publication are new; the rest existed and now sit in one menu.

The chapter dialog gained publication and pinning, and a **new** chapter defaults to
published — someone creating a chapter is arranging material they intend to share.
Editing preserves whatever the chapter already was.

### Chapter publication
No new enum. The existing `is_published` + `published_at` pair now has a UI, and the
AND rule is unchanged: a resource is visible only when the resource **and** its
chapter are both published and due, and the student is enrolled.

Hiding a chapter withdraws its resources **without touching their own state** — so
hiding for a week and republishing returns exactly the mix of published, hidden and
scheduled resources the teacher had. Verified in both directions.

### Deleting a chapter is a three-way question
`resources.chapter_id` cascades, so a bare delete takes the files. A browser
`confirm()` offers two answers to a question that has three, so the dialog offers:

- **Move the N resources to "Non classé"** — reparents *first*, then deletes. If the
  reparent fails, nothing has been destroyed.
- **Delete the chapter and its N resources** — stated plainly, marked irreversible.
- **Cancel.**

An empty chapter skips to a plain confirmation; there is nothing to lose.

### Bulk actions
Select one, select all visible, clear. A floating bar — publish, hide, move, delete —
appears only while something is selected.

Two behaviours worth stating because they are deliberate:

- Bulk writes go through **one statement with `.in()`**, not a loop. RLS filters the
  ids the caller may touch, so a selection reaching into another teacher's group
  updates only the permitted rows. A loop would half-succeed and report nothing.
- The selection **survives** a bulk publish or hide, because those do not change
  which rows are listed. It is cleared when the visible set actually changes — a
  selection that outlived a filter change would act on rows the teacher can no
  longer see.

### Duplication
Resources and whole chapters. A copy:

- gets a **new id**, and inherits **no** `resource_events` — view and download counts
  start at zero, because inheriting another resource's analytics would make the
  numbers lies
- starts **hidden** and unpinned: a duplicate is a draft
- **copies the stored object inside the bucket** rather than re-uploading. The bytes
  are already there. `storage.copy` is authorised by
  `course resources staff write`, keyed on the *destination* folder, so a copy into a
  group the caller does not manage is refused by storage itself. No storage path
  reaches the client; the new one is generated server-side of the client boundary.

### Move and duplicate reuse the Phase 2 cascade
Both go through one `DestinationDialog`: GROUPE chosen, MATIÈRE derived, CHAPITRE
from a query scoped to that group. Both mutations then **re-read the destination
chapter and compare its group** before writing, and `resources_sync_group` derives
`group_id` from the chapter afterwards. Three layers, and the DB one is the authority.

### Ordering
Unchanged and re-verified: `position` first, role weight only as a tiebreak, then
`createdAt`. **Changing a resource's role does not reorder anything** — tested
explicitly, because that would silently undo a teacher's arrangement.

### Duplicate filenames
`file_name` is kept true by the Phase 1 trigger, so this is a column read rather
than a path parse. Uploading a name that already exists in the chapter asks:
**Replace** deletes the old row and its object, then creates the new one — its
events go with it rather than being inherited by a different file. **Keep both**
needs no action. Nothing is silently overwritten.

**Limitation, stated rather than invented around:** there is no version history. The
schema has nowhere to put one, and Phase 3 was not the place to design it. Replace is
delete-then-create, which is honest about what it does.

### Student experience
Pinned chapters sort first, within their group. The **Important** rail is no longer
gated behind the "more than six resources" heuristic — pinning is an explicit act by
a teacher, and suppressing it because a course is small would discard the signal.
"Recent" is a heuristic and stays gated. Progress remains per-student.

---

## 2. Security

**No RLS changed. No security function replaced.** Every new operation is an ordinary
write that the existing policies already govern: `chapters write` and
`resources write` are both `can_manage_group(group_id)`, and the storage policy is
keyed on the destination folder.

Verified by API, not through the UI — teacher A cannot rename, pin, publish, delete,
move into, duplicate into, or bulk-manage teacher B's material; admin can manage
every group; a student cannot create, publish, move or delete anything, and still
cannot see hidden or scheduled resources or obtain a signed URL for one.

---

## 3. Notifications — the insertion point, not the feature (Task 15)

Not built, deliberately. The existing infrastructure is clean and Phase 4 should use
it rather than a second one:

- `public.notifications(user_id, kind, params jsonb, read_at, created_at)`
- `notification_kind` enum — currently `registration_approved`,
  `registration_rejected`, `attendance_marked`, `teacher_assigned`, `group_updated`,
  `announcement`. **No resource value yet.**
- Rows store a `kind` plus a `params` bag, never rendered prose, so one row reads
  correctly in French, Arabic or English depending on who opens it
  (`notification.<kind>` is the template key)
- Emission already happens in **database triggers** — see
  `20260803090000_student_notes_and_notifications.sql:172`

**The clean insertion point** is therefore a trigger, not client code: the publish
transition is the event, and only the database sees every path to it (the dialog,
the chapter menu, "publier tout", a bulk action, and a scheduled `published_at`
falling due).

Phase 4 needs, in this order:

1. **Its own migration** adding `resource_published` / `chapter_published` to
   `notification_kind`. Own file, for the same reason as
   `20260811095000`: Postgres refuses to use a new enum value in the transaction
   that added it, and `supabase db push` runs one migration per transaction.
2. An `AFTER UPDATE` trigger on `resources` / `chapters` firing when the row
   *becomes* live, inserting one notification per approved enrolment.
3. `notification.resource_published` templates in fr/ar/en.

**A scheduled publication has no event yet.** `published_at` falling due changes
visibility without any write, so nothing fires. That needs a scheduled job (pg_cron
or an external tick) and is a Phase 4 decision, not something to fake here.

---

## 4. Verification

| Suite | Result |
|---|---|
| Phase 1 API | **43/43** |
| Phase 1 browser | **21/21** |
| Phase 2 API | **30/30** |
| Phase 2 browser | **41/41** |
| **Phase 3 API** | **39/39** |
| **Phase 3 browser** | **38/38** |
| Unit tests | **95/95** |
| TypeScript | clean |
| ESLint | clean in every changed file |
| Production build | passes |

Browser coverage: 1440 / 1024 / 375, French and Arabic, no horizontal overflow at any
width in either direction — including with the floating bar on screen.

### Three test defects the runs exposed

Worth recording, because each one initially looked like a product bug:

1. **A "cannot publish another teacher's resource" check that could not fail** — the
   fixture created the foreign resource already published, so "still published" was
   the expected state either way. It now starts hidden.
2. **The delete test opened the wrong chapter's menu.** It targeted "the last card",
   but cards sort pinned-first, so the last card was not the newest. The dialog was
   behaving correctly — it showed the empty-chapter variant for an empty chapter.
   Now targeted by content.
3. **The bulk test assumed selection resets after a hide.** It does not, and should
   not: hiding does not remove rows from the list. Re-clicking select-all therefore
   *deselected* everything. The test now asserts the real behaviour.

---

## 5. Files

**New**
- `resources/chapter-delete-dialog.tsx` — the three-way delete
- `resources/destination-dialog.tsx` — shared move/duplicate cascade
- `scripts/e2e/verify-resources-phase3.mjs`
- `scripts/e2e/verify-resources-phase3-ui.mjs`

**Changed**
- `resources/queries.ts` — chapter publication/pinning read+write, `compareChapters`,
  `useSetChapterVisibility`, `useSetChapterPinned`,
  `useSetChapterResourcesVisibility`, `useDuplicateChapter`, a rewritten
  `useDeleteChapter`, `useSetResourcePinned`, `useBulkSetVisibility`,
  `useBulkDeleteResources`, `useBulkMoveResources`, `useDuplicateResource`,
  `findDuplicateFileName`
- `resources/types.ts` — chapter publication/pinning, `compareChapters`,
  `ResourceDestination`
- `resources/chapter-section.tsx` — the action menu, pinned/publication badges, row
  pin and duplicate
- `resources/resource-list-view.tsx` — selection, floating bar, row pin and duplicate
- `resources/resource-dialogs.tsx` — chapter publication and pinning fields
- `routes/dashboard.resources.tsx` — every new handler, both new dialogs, the
  duplicate-filename guard
- `routes/dashboard.my-resources.tsx` — Important rail ungated
- `lib/i18n/dicts/resources.ts` — 41 keys × 3 locales

---

## 6. Remaining issues

1. **No version history for replaced files** — §1, by design.
2. **Scheduled publication fires no notification** — §3. Needs a scheduled job.
3. **Chapter drag-and-drop remains one-chapter-at-a-time reordering** via
   drag or the menu's up/down. It persists correctly and holds after refresh; there
   is no multi-select drag, which nothing asks for.
4. **`Non classé` is an ordinary chapter**, found by title. There is no
   "system chapter" flag in the schema and inventing one would have been a migration
   in service of a label, so it is renameable and orderable like any other. If that
   becomes a problem, a boolean column is the fix.
5. **Bulk move offers every group the caller manages**, so an admin can move material
   between courses. That is intended for an admin; for a teacher the list is already
   their own groups only, and the database refuses the rest.

Phase 4 not started. Nothing pushed. Nothing merged.
