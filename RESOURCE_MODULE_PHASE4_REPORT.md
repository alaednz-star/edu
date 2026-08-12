# Ressources pédagogiques — Phase 4 Report

**Date:** 2026-08-12
**Branch:** `resources/phase1-foundation` (not merged, not deployed)
**Migrations:** 3, all additive

---

## 0. Scope, and how it was determined

**There is no Phase 4 brief in the repository.** `docs/ROADMAP.md` has a "Phase 4 —
Scale", but that is the whole-product roadmap on unrelated numbering, and
`RESOURCE_MODULE_TASKS.md` uses the original 15-phase master-prompt numbering where
"Phase 4 — Chapter management" was already delivered by Phase 3.

So scope came from the two things that *are* authoritative: the unfinished items in
`RESOURCE_MODULE_TASKS.md`, and the Phase 3 report's own statement of what it left.
Two units were genuinely unbuilt and coupled — both consume publication and event
data, and neither existed:

- **Notifications** (tracker Phase 11)
- **Statistics** (tracker Phase 8) — the event log had worked since Phase 1 and
  nothing read it

Deliberately **not** taken, per the instruction that the four Phase 3 issues are
context rather than requirements:

| | Why not |
|---|---|
| Version history for replaced files | A real schema design, not a Phase 4 aside. §5 |
| A system-chapter flag for "Non classé" | The brief says not to add a flag merely because a label exists |
| Bulk-move group exposure | Current behaviour is intentional and the brief says leave it |

---

## 1. Notifications, without a scheduler

### The problem Phase 3 refused to fake

A scheduled publication is not a row write. `published_at` falling due changes what a
student can see while nothing happens in the database, so **no trigger can observe
it**. Both obvious mechanisms are wrong:

- A trigger firing on publish and notifying immediately tells students about material
  they cannot open yet.
- **`pg_cron` is available in this Postgres image but not installed.** Making the
  production migration chain depend on enabling an extension is a real risk on a chain
  that is already ordering-sensitive, and an external tick adds clock drift and
  duplicate delivery on top.

### What was built instead

The notice is created when the teacher **decides**, and carries the instant it becomes
readable: `notifications.deliver_at`.

- Publishing now → deliverable now.
- Scheduling for Monday → a row that exists on Friday and becomes readable on Monday,
  **at the same instant the resource does**, because both are the same `published_at`
  compared against `now()`.

No scheduler, nothing to drift, nothing to double-deliver, and timezone-correct
because both sides are `timestamptz`.

**`deliver_at` is enforced in the read policy, not the client.** A pending notice would
otherwise let a student read "Corrigé du DS 2 arrives Monday" — a small leak, but
exactly the kind that gets left in a client filter. The client repeats the filter only
because an admin bypasses the policy and would otherwise see their own future notices.

### Idempotency

Two partial unique indexes over the object id already carried in `params` — so no new
column for something the payload holds. Verified:

| Behaviour | Result |
|---|---|
| Republish five times | **one** notice |
| Rename the resource | notice updated in place, still one |
| Reschedule | pending notice **moves**, no second one |
| Withdraw while pending | notice **deleted** |
| Withdraw after delivery | notice **kept** — a student's history is not rewritten |

Audience is approved enrolments only: a group with no students notifies nobody, and
**staff are never notified of their own publications**.

There is deliberately no `resource_scheduled` kind. A student has no use for "this will
appear on Monday", and the scheduling is expressed by `deliver_at`.

---

## 2. Statistics, from an aggregate

Two views, no table, no counter column.

The audit's rule was "do not read raw event rows to render a count", and the reason was
correctness, not speed: a client-side count needs every row, and the attendance module
already shipped a `.limit(2000)` that silently under-counted. A stored counter would be
a second source of truth that drifts; the log is append-only, so `count(*)` is exact and
the partial indexes from `20260811100000` make it cheap. If traffic ever makes that
false, the fix is a materialised view on a schedule — not a trigger-maintained integer.

- **`resource_engagement`** — views, downloads, and **distinct students**. One student
  refreshing twelve times is not the same fact as twelve students reading it once, and
  the second is the one a teacher acts on.
- **`resource_student_engagement`** — built from the **enrolment** outwards, not from
  the event log, because a query over events can only list the students who *did* open
  something. The panel needs the others.

### A test caught a real problem

`security_invoker` alone was not enough. A student passes `resources read` for a
published resource and `resource events read` for their own events, so they got a row
back — counting only themselves, but labelled `views` and `distinct_students`.

Nothing leaked, and **that is worse than it sounds**: a view whose numbers mean "the
class" to one reader and "just me" to another is a bug waiting to be rendered. Both
views now carry an explicit `can_manage_group` filter and mean exactly one thing. The
migration asserts both the flag and the gate.

### The panel

A Sheet, matching the attendance drawer, listing **not-opened first**. "Twelve students
read it" is pleasant; "these four did not" is what a teacher can act on.

---

## 3. Migration chain

Three files, all additive: two enum values, one column, three indexes, two trigger
functions, two views, one policy gaining a single conjunct. No column altered, no row
rewritten, no security function replaced.

**The enum split is load-bearing here, and verified rather than assumed.** The next
file creates two *partial* unique indexes whose predicates read
`kind = 'resource_published'`, and an index predicate is evaluated at build time.
Combining the two files on a clone rewound to pre-Phase-4 shape fails with:

```
ERROR:  unsafe use of new value "resource_published" of enum type notification_kind
```

(The trigger bodies would have survived a merge — a function body is only parsed at
call time. The indexes are what make the split necessary.)

Rehearsed the same way as Phase 1: cloned the local database, rewound it to pre-Phase-4
shape — including rebuilding `notification_kind` without the two values, since an enum
value cannot be removed and the replay would otherwise be vacuous — then replayed all
three **one transaction per file**. All three commit; resources 11, chapters 5,
registrations 2, attendance 0, unchanged throughout. Committed as
`scripts/e2e/rehearse-resources-phase4-rewind.sql`.

### Deployment order, unchanged in shape

```
20260811095000  enum value            ─┐
20260811100000  Phase 1 foundation     │  with the application code
20260812090000  notification kinds     │
20260812100000  publication notices    │
20260812110000  engagement views      ─┘
20260811110000  drop is_important      ← only after the new bundle is live
```

Note `20260811110000` sorts **before** the Phase 4 files by filename but must be
applied **last**. That was already true after Phase 1 and Phase 4 does not change it,
but it now looks wrong in a directory listing, so it is worth stating: the Phase 1
release plan's step 4 is still a separate, later push.

---

## 4. Verification

| Suite | Result |
|---|---|
| Phase 1 API / browser | **43/43** · **21/21** |
| Phase 2 API / browser | **30/30** · **41/41** |
| Phase 3 API / browser | **39/39** · **38/38** |
| **Phase 4 API** | **29/29** |
| **Phase 4 browser** | **19/19** |
| Unit | **95/95** |
| TypeScript · ESLint · Build | clean · clean · passes |

Browser: 1440 / 1024 / 375, French and Arabic, no horizontal overflow either
direction. Real flows — a teacher publishes through the dialog, the student opens the
bell and reads prose (not a template key), a scheduled resource stays absent from the
bell, the student opens a resource, the teacher opens the panel and sees who did not.

### Security

No RLS weakened, no security function replaced. `deliver_at` **tightens** the read
policy; the engagement views are staff-only by explicit gate. Verified through real
tokens, not the UI: a pending notice is unreachable by direct id lookup and by asking
for everything; a student can read neither engagement view; a teacher sees no aggregate
for another group's resource; an admin sees both.

### One test defect, proven as such

Three browser assertions failed because the panel's group headings are uppercased by
CSS, so `innerText` returns `2 ÉLÈVE(S) N'ONT PAS CONSULTÉ` and my lowercase regexes
missed them. The printed panel text in the failure output showed the correct content —
that is what proved it was the assertion and not the panel, before I changed anything.

---

## 5. Remaining genuine issues

1. **No version history for replaced files.** Unchanged from Phase 3. Replace is still
   delete-then-create. Doing it properly needs a `resource_versions` table holding
   filename, size, storage object, uploader, timestamp and reason, plus a decision about
   whether events follow the resource or the version — a design, not an increment.
2. **No digest for a burst of publications.** The tracker's "5 nouveaux documents dans
   …" wants one notice per chapter per hour instead of five. `deliver_at` makes that
   possible (collapse pending notices sharing a chapter) but it is a product decision
   about what a student should see, so it was not guessed at.
3. **A withdrawn-then-republished resource does not re-notify** if its first notice was
   already delivered. That is the idempotency rule working as designed, and it is
   probably right — but if a teacher hides something for a month and republishes it, no
   one is told. Worth a decision.
4. **`resource_engagement` is a plain view.** Exact and cheap at this scale; the note in
   the migration says what to do when that stops being true.
5. **Notification preferences do not exist.** A student cannot turn resource notices
   off. Out of scope here, but it is the natural next request.

---

Nothing merged. Nothing pushed. Nothing deployed.
