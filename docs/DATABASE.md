# Database

Supabase Postgres, project `yuhqddiebzgcscorgauq`. Six migrations under `supabase/migrations/`.
All statements below were verified against the live database on 2026-08-02.

---

## 1. Enums

| Type | Values |
| --- | --- |
| `app_role` | `admin`, `teacher`, `student` |
| `entity_status` | `active`, `inactive` |
| `registration_status` | `pending`, `approved`, `rejected` |
| `attendance_status` | `present`, `absent`, `late`, `excused` |
| `level_stage` | `primary`, `middle`, `high` |

## 2. Tables

| Table | Key | Notes |
| --- | --- | --- |
| `profiles` | `id` → `auth.users` | Name, email, phone, avatar, `locale` (CHECK `fr`/`ar`/`en`) |
| `user_roles` | `id`; UNIQUE `(user_id, role)` | Authorization source of truth |
| `levels` | `id` | 12 seeded Algerian school levels, `position` for ordering |
| `subjects` | `id` | 5 seeded subjects, hex `color` |
| `teachers` | `id` → `profiles` | Experience, bio, status |
| `teacher_subjects` | PK `(teacher_id, subject_id)` | Join table |
| `students` | `id` → `profiles` | `level_id`, guardian phone, `registered_at` |
| `groups` | `id` | Class group: subject, teacher, level, capacity, `price_dzd` |
| `group_schedules` | `id` | `weekday` 0–6 CHECK, start/end time, room |
| `registrations` | `id`; UNIQUE `(student_id, group_id)` | Enrolment request + decision |
| `attendance` | `id`; UNIQUE `(group_id, student_id, session_date)` | Daily marks, `marked_by` |
| `center_settings` | `id boolean PK CHECK (id)` | Singleton-row pattern for centre config |

Modelling is sound: roles are normalized into their own table, `teachers`/`students` extend
`profiles` by shared primary key, join tables use composite keys, and the natural uniqueness
constraints (one registration per student per group, one attendance mark per student per session
per group) are enforced in the database rather than in application code.

`center_settings` uses a `boolean PRIMARY KEY CHECK (id)` to guarantee exactly one row — a
legitimate, if unusual, singleton idiom.

## 3. Functions

| Function | Schema | Security | Purpose |
| --- | --- | --- | --- |
| `has_role(uuid, app_role)` | `private` | DEFINER, `search_path=public` | Role lookup |
| `is_admin()` | `private` | DEFINER, `search_path=public` | Admin shortcut |
| `handle_new_user()` | `public` | DEFINER | Signup trigger |
| `set_updated_at()` | `public` | — | `updated_at` trigger |

`has_role` and `is_admin` were moved from `public` to a `private` schema in migration 4 so they are
not exposed as PostgREST RPC endpoints. Execute privileges are correctly revoked from `anon` and
granted only to `authenticated` and `service_role`. This is good practice — **but it introduced a
critical defect, documented below and in KNOWN_ISSUES.**

### ~~CRITICAL: `private.is_admin()` is broken in production~~ ✅ FIXED 2026-08-02

> Resolved by migration `20260802210000_fix_is_admin_schema_resolution.sql`. The description below
> is retained because it documents a failure mode worth recognising again. Current state verified:
> `private.is_admin()` returns `true` for the production admin, and both functions now use
> `SET search_path TO 'private', 'public'` with EXECUTE granted only to `authenticated` and
> `service_role`.

The stored body **was**:

```sql
CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'admin');   -- ← public.has_role no longer exists
$function$;
```

Migration 4 relocated `has_role` to the `private` schema, but `is_admin`'s body still calls
`public.has_role(...)`, and its `search_path` is pinned to `public` so `private` is never searched.
Every invocation raises:

```
ERROR 42883: function public.has_role(uuid, unknown) does not exist
```

**Verified impact** (run as `authenticated` with each role's JWT claims):

| Operation | Result |
| --- | --- |
| Admin: `SELECT * FROM profiles` | `ERROR 42883` |
| Admin: `INSERT INTO groups` | `ERROR 42883` |
| Admin: `INSERT INTO subjects` | `ERROR 42883` |
| Admin: `UPDATE center_settings` | `ERROR 42883` |
| Any user: `SELECT * FROM user_roles` (unfiltered) | `ERROR 42883` |
| Student: `SELECT` on `levels`, `subjects` | Works (policy is `USING (true)`) |
| Any user: self-filtered `SELECT ... WHERE id = auth.uid()` | Works |

The reason this was not caught earlier: Postgres short-circuits `OR`. A query filtered to the
user's own row satisfies `id = auth.uid()` before `is_admin()` is ever evaluated, so **login and
the student dashboard appear healthy** while the entire admin console is dead.

**Fix** (one line, no data migration):

```sql
CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'private, public'
AS $function$
  SELECT private.has_role(auth.uid(), 'admin');
$function$;
```

## 4. Row Level Security

RLS is **enabled on all 12 tables** (`relforcerowsecurity` is false, which is normal — the tables
are owned by `postgres` and application roles are not owners).

All 32 policies are scoped `TO authenticated`; none grant anything to `anon`.

| Table | Read | Write |
| --- | --- | --- |
| `levels`, `subjects`, `groups`, `group_schedules`, `teacher_subjects`, `center_settings` | any authenticated user | admin only |
| `teachers` | any authenticated user | self or admin |
| `profiles`, `students` | self, admin, or the teacher of an *approved* group the student is in | self or admin |
| `user_roles` | self or admin | admin only |
| `registrations` | student, admin, or the group's teacher | student inserts own; admin decides |
| `attendance` | student, admin, or the group's teacher | admin or the group's teacher |

The teacher-scoping on `profiles` and `students` (migration 3) is genuinely well done — it narrows
teachers to students in groups they actually teach, and only for `approved` registrations, rather
than the blanket "any teacher sees every student" of the first migration.

## 5. Grants — ✅ FIXED 2026-08-02

**Current state** (verified): `anon` holds **no privileges** on any public table.
`authenticated` holds exactly `SELECT, INSERT, UPDATE, DELETE` on all 12 tables, with RLS deciding
rows. `ALTER DEFAULT PRIVILEGES` prevents the platform default from re-granting the extra verbs to
future tables. Applied by `20260802210200_revoke_unnecessary_grants.sql`.

Anonymous requests now fail at the privilege layer with HTTP `401` instead of relying solely on RLS
returning zero rows — verified against the live PostgREST endpoint.

### Original finding (historical)

`anon` and `authenticated` both held `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`
on **all 12 public tables**. The migrations only ever granted the four DML verbs, so `TRUNCATE`,
`REFERENCES`, and `TRIGGER` came from a platform default.

Assessment — this is **hardening, not an active breach**:
- RLS denies `anon` every row for SELECT/INSERT/UPDATE/DELETE (no policy covers `anon`).
- `TRUNCATE` is *not* filtered by RLS, so the grant is theoretically dangerous.
- However, PostgREST exposes only SELECT/INSERT/UPDATE/DELETE and RPC. It has no `TRUNCATE` verb,
  and `anon` cannot execute any function (verified: `has_function_privilege('anon', …)` is false
  for all four functions). There is therefore **no reachable path** from the public API today.

It should still be revoked as defence-in-depth:

```sql
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
```

## 6. Indexes — ✅ ADDED 2026-08-02

11 indexes applied by `20260802210100_add_foreign_key_indexes.sql`:
`idx_user_roles_user_id`, `idx_students_level_id`, `idx_groups_teacher_id`,
`idx_groups_subject_id`, `idx_groups_level_id`, `idx_group_schedules_group_id`,
`idx_registrations_group_id`, `idx_registrations_approved` (partial),
`idx_attendance_student_id`, `idx_attendance_session_date`, `idx_teacher_subjects_subject_id`.

Indexes redundant with existing UNIQUE constraints were deliberately omitted: `registrations`
already indexes `student_id` as the leading column of `UNIQUE (student_id, group_id)`, and
`attendance` already covers `group_id` via `UNIQUE (group_id, student_id, session_date)`. Adding
those would cost write throughput for no read benefit.

### Original finding (historical)

**Zero `CREATE INDEX` statements across all six migrations.** Only the implicit indexes behind
primary keys and `UNIQUE` constraints were present.

Every foreign key used for filtering is unindexed. At current data volumes (12 levels, 5 subjects,
2 users) this is invisible; it degrades sharply as a real centre onboards. The RLS policies make it
worse than a normal schema, because subqueries such as

```sql
EXISTS (SELECT 1 FROM registrations r JOIN groups g ON g.id = r.group_id
        WHERE r.student_id = students.id AND r.status = 'approved' AND g.teacher_id = auth.uid())
```

run **per row scanned** on `profiles` and `students`.

Recommended:

```sql
CREATE INDEX idx_user_roles_user_id       ON public.user_roles(user_id);
CREATE INDEX idx_students_level_id        ON public.students(level_id);
CREATE INDEX idx_groups_teacher_id        ON public.groups(teacher_id);
CREATE INDEX idx_groups_subject_id        ON public.groups(subject_id);
CREATE INDEX idx_groups_level_id          ON public.groups(level_id);
CREATE INDEX idx_group_schedules_group_id ON public.group_schedules(group_id);
CREATE INDEX idx_registrations_group_id   ON public.registrations(group_id);
CREATE INDEX idx_registrations_student_id ON public.registrations(student_id);
CREATE INDEX idx_registrations_status     ON public.registrations(status) WHERE status = 'approved';
CREATE INDEX idx_attendance_group_date    ON public.attendance(group_id, session_date);
CREATE INDEX idx_attendance_student_id    ON public.attendance(student_id);
CREATE INDEX idx_teacher_subjects_subject ON public.teacher_subjects(subject_id);
```

## 7. Migration hygiene

Migration 5 hard-codes a personal email address to bootstrap the first admin:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin' FROM auth.users u WHERE u.email = 'alaednz@gmail.com';
```

This works but is not reproducible for a fresh environment and embeds a personal address in
version control. A seed script or an environment-driven bootstrap is preferable before this ships
to other centres.

## 8. Current data

`user_roles`: 1 admin, 1 student. `levels`: 12. `subjects`: 5. `groups`, `registrations`,
`attendance`: empty. The product has not yet onboarded real users.
