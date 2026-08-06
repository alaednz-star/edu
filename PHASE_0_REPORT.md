# Phase 0 — Production Blockers: Completion Report

**Date:** 2026-08-02
**Scope:** Production blockers only. No refactoring, no redesign, no new features.
**Source changes:** none — `src/` is byte-for-byte unchanged.

---

## 1. What changed

### 1.1 `supabase/migrations/20260802210000_fix_is_admin_schema_resolution.sql` — CRITICAL

**What:** Recreated `private.is_admin()` and `private.has_role()` with
`SET search_path TO 'private', 'public'`, and corrected `is_admin()`'s body to call
`private.has_role(...)` instead of `public.has_role(...)`.

**Why:** Migration `20260802191718` moved both functions from `public` to `private`. Postgres
rewrote every RLS policy to the new schema automatically, but it does **not** rewrite function
*bodies*. `is_admin()` kept calling `public.has_role(...)` — which no longer existed — while its
`search_path` was pinned to `public`, so the call could never resolve. Every policy branch
evaluating `is_admin()` raised `ERROR 42883`, taking the entire admin console down on the live site.

**Why it stayed hidden:** Postgres short-circuits `OR`. A policy reading
`id = auth.uid() OR is_admin()` never evaluates the second branch for self-filtered queries, so
login and the student dashboard worked normally while every admin screen was dead.

**Note on the fix:** `CREATE OR REPLACE FUNCTION` silently resets privileges to `EXECUTE TO PUBLIC`.
The migration therefore re-applies the `REVOKE`/`GRANT` lockdown from the original hardening
migration. Without that, the fix would have handed `anon` the ability to call the admin check.

### 1.2 `supabase/migrations/20260802210100_add_foreign_key_indexes.sql`

**What:** 11 indexes — `idx_user_roles_user_id`, `idx_students_level_id`, `idx_groups_teacher_id`,
`idx_groups_subject_id`, `idx_groups_level_id`, `idx_group_schedules_group_id`,
`idx_registrations_group_id`, `idx_registrations_approved` (partial, `WHERE status = 'approved'`),
`idx_attendance_student_id`, `idx_attendance_session_date`, `idx_teacher_subjects_subject_id`.

**Why:** The schema had **zero** indexes beyond primary keys and unique constraints. This matters
more than usual here because the RLS policies on `profiles` and `students` contain a correlated
subquery joining `registrations` and `groups`, evaluated per row scanned. `user_roles.user_id` is
the hottest path in the system — every `is_admin()` call filters on it.

**Deliberately omitted:** `registrations.student_id` and `attendance.group_id` are already the
leading columns of existing UNIQUE constraints. Indexing them again would cost write throughput for
no read benefit.

### 1.3 `supabase/migrations/20260802210200_revoke_unnecessary_grants.sql`

**What:** Revoked `TRUNCATE`, `REFERENCES`, `TRIGGER` from `anon` and `authenticated` on all public
tables; revoked **all** privileges from `anon`; re-granted exactly `SELECT, INSERT, UPDATE, DELETE`
to `authenticated`; and set `ALTER DEFAULT PRIVILEGES` so future tables do not inherit the extras.

**Why:** `anon` and `authenticated` held `TRUNCATE` on all 12 tables from a platform default. RLS
cannot filter `TRUNCATE` — it is table-level. No exploit path existed (PostgREST has no `TRUNCATE`
verb and `anon` could execute no function), but the grant was one misconfigured RPC away from
irreversible data loss.

**Safety check performed first:** confirmed the marketing landing page, public layout, and all four
auth pages make **zero** table reads — they use only `supabase.auth.*` (GoTrue), which is unaffected
by table grants. Revoking `anon` was therefore safe.

### 1.4 `.gitignore` + `.env.example`

**What:** Added ignore rules for `.env.local`, `.env.*.local`, `.env.production`,
`.env.development.local`, `*.key`, `*.pem`, `service-account*.json`. Added a documented
`.env.example`.

**Why:** `.env` holds only the Supabase URL, project ID, and **publishable** (anon) key — all public
by design and already in the client bundle. Nothing sensitive was exposed. `.env` was deliberately
**not** ignored, because it is part of the project configuration and removing it would break the
platform integration. The real risk was procedural: `.env` is where someone would eventually paste
`SUPABASE_SERVICE_ROLE_KEY`. `.env.example` now states explicitly that the service role key bypasses
RLS entirely and must live only in platform secrets.

---

## 2. Regression test results

Executed against the **live** Supabase project through the real PostgREST and GoTrue HTTP APIs —
not simulated. A temporary QA account was created, exercised, and deleted.

### 2.1 Authentication

| Test | Result |
| --- | --- |
| Register (real `/auth/v1/signup`) | **PASS** — HTTP 200, session returned |
| Signup trigger assigns `student` (never admin) | **PASS** — `[{"role":"student"}]` |
| Signup trigger creates `profiles` + `students` rows | **PASS** — profile `locale` defaulted to `fr` |
| Login (real `/auth/v1/token`) | **PASS** — HTTP 200 |
| Production admin `is_admin()` | **PASS** — returns `true` |

### 2.2 Admin pages — reads (exact queries from `queries.ts`)

| Page | Result |
| --- | --- |
| Dashboard (`hydrate` profiles + user_roles) | **PASS** — 3 rows / 3 rows |
| Levels | **PASS** — 12 rows |
| Subjects | **PASS** — 5 rows |
| Teachers (embedded `profiles!inner` + `teacher_subjects` + `subjects`) | **PASS** |
| Students (embedded `profiles!inner` + `levels`) | **PASS** |
| Groups (embedded `subjects` + `levels` + `group_schedules`) | **PASS** |
| Registrations (nested `groups → subjects/levels`) | **PASS** |
| Attendance (today) | **PASS** |
| Settings | **PASS** — 1 row |

All 10 reads returned HTTP 200. Before the fix, every one of these failed with `42883`.

### 2.3 Admin pages — writes

| Operation | Result |
| --- | --- |
| Levels CREATE / UPDATE | **PASS** |
| Subjects CREATE / UPDATE | **PASS** |
| Groups CREATE / UPDATE | **PASS** |
| Group schedules CREATE | **PASS** |
| Students UPDATE (+ linked profile UPDATE) | **PASS** |
| Registrations CREATE / APPROVE | **PASS** |
| Attendance UPSERT (on the 3-column conflict target) | **PASS** |
| Settings UPDATE | **PASS** |
| DELETE paths (attendance, registration, schedules, group, subject, level) | **PASS** — all HTTP 204 |

### 2.4 Authorization — negative tests (the important ones)

| Test | Expected | Result |
| --- | --- | --- |
| Student → promote self to admin | deny | **PASS** — HTTP 403, RLS violation |
| Student → read all profiles | own row only | **PASS** — 1 row, not 3 |
| Student → create subject | deny | **PASS** — HTTP 403 |
| Student → create group | deny | **PASS** — `42501` |
| Student → write centre settings | deny | **PASS** — 0 rows |
| Student → edit another user's profile | deny | **PASS** — 0 rows |
| Student → approve own registration | deny | **PASS** — 0 rows |
| Teacher → mark attendance for own group | allow | **PASS** |
| Teacher → create group | deny | **PASS** — `42501` |
| Teacher → write centre settings | deny | **PASS** — 0 rows |
| Teacher → see students | own approved students only | **PASS** — correctly scoped |
| Anonymous → read any table | deny | **PASS** — HTTP **401** on all 7 tables tested |

The anon result is a genuine improvement: previously RLS returned empty sets; now the request is
rejected at the privilege layer before RLS is consulted.

### 2.5 Application build

| Check | Result |
| --- | --- |
| `tsc --noEmit` (strict) | **PASS** — 0 errors |
| `npm run build` | **PASS** |
| Dev server routes (`/`, `/login`, `/register`, `/dashboard`, `/dashboard/students`, `/dashboard/settings`) | **PASS** — all HTTP 200 |

### 2.6 Data integrity after testing

Verified the database returned to its exact pre-test state: 12 levels, 5 subjects, 0 groups,
0 registrations, 0 attendance, 2 profiles, 2 user_roles, `center_settings.school_name = "Madrasti"`,
zero `QA%` leftovers, QA auth account deleted.

---

## 3. Remaining blockers

**None for Phase 0.** The application is functional in production: admins can sign in and operate
every management page, students can register and self-enrol, and all three roles are correctly
isolated.

### Caveats you should know about

1. **Teacher role is untested with real data.** There are currently **zero** teachers in the
   database. Teacher permissions were verified with a transactional fixture (rolled back), which
   exercises the RLS policies faithfully but not the UI. When you onboard a real teacher, re-check
   `/dashboard/teacher` and `/dashboard/attendance` in the browser.

2. **Browser click-through not performed.** I verified every page's underlying queries over HTTP and
   confirmed all routes return 200, but I did not drive the UI in a real browser session. The data
   layer is proven; the rendering is inferred from it.

3. **A third user exists** — `admin@adk.site.je`, currently holding the `student` role. Untouched.
   Flagging in case that account was intended to be an admin.

4. **Migrations were applied directly to the live database** via the Supabase SQL API, and the
   migration files were written to `supabase/migrations/` to match. If your deployment pipeline
   replays migrations against this same database, all three are idempotent
   (`CREATE OR REPLACE`, `IF NOT EXISTS`, and re-runnable `REVOKE`/`GRANT`) and are safe to re-apply.

### Known non-blockers carried into Phase 1

Unchanged and still open, in priority order: query errors invisible in the UI (K2/TD-2 — this is
what let the `is_admin()` outage hide), no server-side value validation (H3/TD-5), render-time route
guards (H1/TD-6), teachers routed into the admin Groups CRUD screen (M1/TD-9), and CSV formula
injection (M2/TD-10).

---

## 4. Files changed

```
A  supabase/migrations/20260802210000_fix_is_admin_schema_resolution.sql
A  supabase/migrations/20260802210100_add_foreign_key_indexes.sql
A  supabase/migrations/20260802210200_revoke_unnecessary_grants.sql
A  .env.example
M  .gitignore
M  docs/DATABASE.md          (status updates)
M  docs/SECURITY.md          (status updates)
M  docs/KNOWN_ISSUES.md      (status updates)
A  PHASE_0_REPORT.md
```

`src/` — **no changes.**
