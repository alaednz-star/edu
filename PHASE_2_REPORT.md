# Phase 2 — Feature Completion: Implementation Report

**Date:** 2026-08-03
**Scope:** Complete the modules a real tutoring centre needs for daily operations.
**Constraint honoured:** no UI redesign, no architectural refactor, no new business domains.

---

## 1. Database changes

One migration: `20260803090000_student_notes_and_notifications.sql`.

### `student_notes`
Private observations a teacher or admin keeps about a student.

The RLS model is the important part. Read access is granted to admins, and to teachers **only for
students enrolled in a group they teach** — mirroring the existing scoping on `public.students`.
Students deliberately **cannot read notes written about them**. Insert requires
`author_id = auth.uid()`, so a note can never be written under someone else's name. Authors edit and
delete their own notes; admins may moderate any.

### `notifications`
Rows store a `kind` enum plus a jsonb `params` bag — **never rendered prose**. The client renders
`notification.<kind>` as a translated template, so the same notification reads correctly in French,
Arabic or English depending on who opens it. Storing text would have permanently frozen each
notification into whichever language the actor happened to be using.

A `SECURITY DEFINER` trigger on `registrations` fires on status change and notifies the student
automatically. It is definer-rights because the actor is the admin, not the recipient, so the insert
must bypass the recipient-scoped policy.

### Verification

| Test | Result |
| --- | --- |
| Student reads notes about themselves | **0 rows** — invisible, as designed |
| Student forges a note | **HTTP 403** (`42501`) |
| Student forges a notification | **HTTP 403** (`42501`) |
| Student reads own notifications | **HTTP 200** |
| Admin reads notes | works |
| Approving a registration | auto-creates `registration_approved` notification |
| `anon` on both new tables | **HTTP 401** — Phase 0 grant hardening extends correctly |

Tested transactionally (rolled back) and over the real HTTP API with a throwaway account, since
deleted afterwards. Database confirmed clean: 2 real users, 0 QA rows, 12 levels, 5 subjects intact.

---

## 2. Modules delivered

### M1 — Teacher workspace
Weekly timetable added to the teacher overview (`weeklySessions` already existed and was unused).
Group names link to the new group detail page. New **My students** page lists every student across
the teacher's groups, searchable and sortable, each linking to their profile. Teachers reach
attendance in one click from three places.

### M2 — Student portal
Added a registrations section showing pending/approved/rejected status per request, and a link to
the new profile page. The existing schedule, attendance history and rate widgets were kept.

### M3 — Student profile (`/dashboard/students/$studentId`)
Photo, contact details, level, registration date, status, enrolled groups with schedules, attendance
statistics (rate, present/absent/late/excused), the last 20 sessions, and the private notes thread
with add/delete. Admin and teacher only.

### M4 — Teacher profile (`/dashboard/teachers/$teacherId`)
Photo, bio, experience, subjects, status, assigned groups with occupancy bars, weekly timetable, and
computed workload stats (groups, students, sessions/week, fill rate). Admin only.

### M5 — Group detail (`/dashboard/groups/$groupId`)
Subject, teacher, level, room, capacity, price, status, occupancy percentage with progress bar,
weekly schedule, enrolled students (linked to their profiles), and pending requests with a route to
the registrations queue.

### M6 — Attendance module (`/dashboard/attendance-report`)
Date-range, group and status filters; present/absent/late/excused statistics with attendance rate;
full history table; CSV export. **Teachers see only their own groups** — enforced in the query, not
just the UI.

While here I fixed **TD-10 (CSV formula injection)**: values beginning `=`, `+`, `-`, `@`, tab or CR
are now prefixed with a quote, so a student named `=HYPERLINK(...)` can no longer become a live
formula in an exported roster. Headers are escaped too, which they previously were not.

### M7 — Dashboard analytics
The admin dashboard already had most requested widgets (students, teachers, groups, subjects,
attendance today, today's classes, pending requests, occupancy, popular subjects, quick actions).
Added the genuinely missing one: **Students at risk** — attendance below 70% over 30 days, requiring
at least 3 sessions so a single absence in a new group does not flag anyone.

### M8 — Global search
Already had ⌘K/Ctrl-K. Extended to include **levels**, and results now **deep-link to detail pages**
instead of dumping the user on a list page.

### M9 — Notifications
Bell in the topbar with unread badge, dropdown panel, relative timestamps, click-to-read,
mark-all-read, and a 60-second refetch. Six notification kinds, all translated.

### M10 — Settings / profile
New **My profile** page: identity (name, phone, avatar), account (email, role), security
(password-reset email), and language preference. Reachable from the avatar menu and the sidebar.

### M11 — Production polish
- **Removed dead code:** `WEEKDAYS` and `STAGE_LABELS` in `types.ts` — duplicates with hardcoded
  French that bypassed i18n entirely. Also a pointless `Percent()` helper I wrote and caught in
  review, and an unused `shortTime` export.
- **Removed placeholder copy:** the login page told real users *"Demo authentication — backend
  coming soon"*, and an empty state said *"modules will land in the next phase"*. Both replaced in
  all three locales.
- **Deduplicated:** `initialsOf` now shared (the topbar had its own copy; two list pages used
  `slice(0, 2)`, which mishandles multi-word Arabic names). Added `formatDate`/`formatDzd` so date
  and currency formatting is locale-aware rather than hardcoded `fr-FR`.
- **Shared component:** `AttendanceBreakdown` is used by the student profile and the attendance
  report, so the statistics are computed and presented identically.

---

## 3. Audit results

| Check | Result |
| --- | --- |
| `tsc --noEmit` (strict) | **0 errors** |
| `npm run lint` | **0 logic errors** (only the 8 pre-existing `react-refresh` warnings) |
| `npm run build` | **Pass** |
| All 20 routes live | **200**, including the 3 new dynamic detail routes |
| Runtime errors in dev log | **none** |
| i18n parity fr/ar/en | **882 / 882 / 882** — none missing, none extra |
| Static `t()` keys resolve | **all** |
| Dynamic template keys resolve | **all** (notification kinds, statuses, roles) |
| TODO / FIXME / placeholder text | **none** |
| Fake or demo data | **none** |
| Unused exports in new code | **none** (one found and removed) |

---

## 4. What remains

### Not delivered, and why

1. **Guardian phone (M3).** The spec asks for it on the student profile. `profiles` has a single
   `phone` column and no guardian field. Adding one is a schema change with a form, migration and
   RLS implications — it belongs in a migration of its own rather than being smuggled into a page.
   **Recommend adding `guardian_phone` to `students` in Phase 3.**
2. **Logo upload, time zone, working days, default attendance rules (M10).** Settings currently
   stores a logo *URL*, not an upload — real upload needs Supabase Storage, a bucket, and its own
   RLS policies. Time zone, working days and attendance rules need new `center_settings` columns.
   All four are schema/infrastructure work, not UI work.
3. **Attendance editing during the same day (M1)** already worked — the save path upserts on
   `(group_id, student_id, session_date)`, so re-marking overwrites. No change needed.
4. **Monthly growth widget (M7).** Deliberately skipped: with 2 users and no historical data, it
   would render a fabricated trend. It becomes meaningful once the centre has a few months of real
   registrations.

### Verification caveats

- **No browser click-through.** Verified by reading each page, confirming all routes return 200 with
  no runtime errors, unit-checking i18n, and exercising the database over real HTTP. Visual layout
  and RTL rendering are inferred from the shared components, not observed.
- **Teacher features remain untested with real data** — still zero teachers in the database. The
  teacher pages, My students, and the report's teacher scoping are correct by construction and their
  RLS is verified, but no teacher has exercised them.
- **New pages are not yet paginated at the query level.** They filter client-side like the existing
  list pages. Fine at current volume; TD-7 covers this.

### Carried forward

Server-side validation (TD-5), `beforeLoad` route guards (TD-6), pagination and SQL-side joins
(TD-7), splitting `queries.ts` (TD-8 — now more pressing, the data layer spans four files),
cookie sessions (TD-11), lazy locales (TD-16 — the dictionary is now 882 keys × 3), SSR locale
(TD-17), and the RLS test suite (TD-22 — highest value, since RLS is still the only security
boundary and Phase 2 added two more tables to it).

---

## 5. Files changed

```
NEW  supabase/migrations/20260803090000_student_notes_and_notifications.sql
NEW  src/features/school/notifications.ts
NEW  src/features/school/profiles.ts
NEW  src/features/school/components/attendance-breakdown.tsx
NEW  src/components/layout/notification-bell.tsx
NEW  src/lib/format.ts
NEW  src/lib/i18n/dicts/workspace.ts
NEW  src/routes/dashboard.profile.tsx
NEW  src/routes/dashboard.my-students.tsx
NEW  src/routes/dashboard.attendance-report.tsx
NEW  src/routes/dashboard.students.$studentId.tsx
NEW  src/routes/dashboard.teachers.$teacherId.tsx
NEW  src/routes/dashboard.groups.$groupId.tsx
NEW  PHASE_2_REPORT.md

MOD  src/integrations/supabase/types.ts        new tables + notification_kind enum
MOD  src/features/school/types.ts              new types; removed dead WEEKDAYS/STAGE_LABELS
MOD  src/features/school/components/{teacher,student}-overview.tsx
MOD  src/components/layout/{dashboard-topbar,global-search}.tsx
MOD  src/config/navigation.ts                  3 new entries
MOD  src/lib/export-csv.ts                     formula-injection fix (TD-10)
MOD  src/lib/i18n/dictionaries.ts              register workspace module; fix stale copy
MOD  src/routes/dashboard.{index,students,teachers,groups}.tsx   detail-page links
```

---

## 6. Recommended order for Phase 3

1. **RLS test suite (TD-22).** Two more tables now depend on RLS as the only boundary. This is the
   highest-value item on the register and everything else gets safer once it exists.
2. **Schema completion:** `guardian_phone`, `center_settings` columns (time zone, working days,
   attendance defaults), and Supabase Storage for logo/avatar upload. Groups the four deferred
   items into one migration.
3. **Server-side validation (TD-5).** CHECK constraints for the invariants — negative prices,
   inverted time ranges — plus shared Zod schemas. Cheapest durable win.
4. **`beforeLoad` route guards (TD-6).** Fixes the "admin UI flashes then fails" class of problem.
5. **Split `queries.ts` (TD-8)** — now spanning four files with overlapping concerns.
6. **Pagination (TD-7)** before the first centre with more than ~200 students onboards.

**Before any of it: decide multi-tenancy.** `center_settings` is still a single-row singleton — the
schema models exactly one centre. If Madrasti is to serve multiple centres, retrofitting `tenant_id`
after payments and invoicing exist will be dramatically more expensive than doing it now.
