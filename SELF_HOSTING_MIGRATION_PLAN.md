# Migration Plan — Removing the Lovable Cloud Dependency

**Status:** Audit only. No code changed.

**Headline:** The coupling is far smaller than expected. The application code is
**already portable** — zero hardcoded URLs, zero storage usage, zero realtime,
zero cloud-only SQL. What you are actually migrating is *hosting*, not *code*.

The realistic blockers are three, and only one is technical work:

1. **Docker is not installed** — a hard prerequisite. Verified: `docker: command not found`.
2. **Email flows** (password reset, signup confirmation) need a local mail catcher.
3. **Data export** requires a privileged credential only you hold.

---

## 1. Everything currently dependent on Lovable Cloud

Measured, not assumed.

| # | Dependency | Where | Severity |
|---|---|---|---|
| 1 | **Hosted Postgres + Auth + PostgREST** — project `yuhqddiebzgcscorgauq` | `.env`, `supabase/config.toml` | **High** — the real dependency |
| 2 | `@lovable.dev/vite-tanstack-config` v2.8.5 | `package.json`, `vite.config.ts` | **Low** — see below |
| 3 | `window.__lovableEvents` / `__lovableReportRuntimeError` | `src/lib/error-reporting.ts` | **Trivial** — optional-chained no-ops |
| 4 | `LOVABLE:BEGIN/END` block | `AGENTS.md` | **None** — documentation |
| 5 | `minimumReleaseAgeExcludes` list | `bunfig.toml` | **None** — install-policy hint |

### On dependency #2 — it is not what it looks like

I inspected the package rather than judging by its name:

- **Zero network calls.** No URL literals anywhere in its `dist/`.
- It is a **config aggregator** wrapping standard OSS plugins: `@vitejs/plugin-react`,
  `@tailwindcss/vite`, `vite-tsconfig-paths`, `nitro`, `@tanstack/react-start/plugin/vite`,
  `@tanstack/devtools-vite`, `lightningcss`.
- Every Lovable-specific plugin is gated behind `isSandboxEnvironment()`
  (`LOVABLE_SANDBOX=1` or `DEV_SERVER__PROJECT_PATH`) or a `previewHost` env var.
  **All are unset on your machine, so they are already inert locally.**

This package is a *build-time convenience*, not a runtime tether. Replacing it is
optional and I recommend deferring it — see Step 7.

### Not dependencies (checked and cleared)

- **Storage** — 0 references in `src/`, 0 buckets in migrations. Nothing to migrate.
- **Realtime** — 0 `.channel()` / `postgres_changes` subscriptions.
- **Edge Functions** — no `supabase/functions/` directory.
- **Cloud-only SQL** — 0 uses of `vault.`, `pg_net`, `supabase_functions`,
  `pgsodium`, `graphql`, `realtime.`. No `CREATE EXTENSION` required.

---

## 2. Everything already portable

| Component | Evidence |
|---|---|
| **Supabase client** | 0 hardcoded URLs in `src/`; reads `VITE_SUPABASE_URL` with `process.env` SSR fallback ([client.ts:32](src/integrations/supabase/client.ts#L32)) |
| **Schema** | 17 migrations, 75,704 bytes, fully declarative and idempotent |
| **16 tables** | attendance, audit_log, center_settings, group_schedules, groups, levels, notifications, profiles, registrations, streams, student_notes, students, subjects, teacher_subjects, teachers, user_roles |
| **8 enums** | app_role, attendance_status, audit_action, entity_status, gender, level_stage, notification_kind, registration_status |
| **16 functions / 19 triggers / 44 RLS policies** | All standard Postgres — identical behaviour self-hosted |
| **Server Functions** | TanStack Start `createServerFn`; runs wherever Node runs. Not a Supabase feature |
| **Teacher provisioning** | Uses `auth.admin.*` from `@supabase/supabase-js` — works against any GoTrue instance |
| **Auth surface** | `signUp`, `signInWithPassword`, `signOut`, `getSession`, `getClaims`, `updateUser`, `onAuthStateChange`, `resetPasswordForEmail` — all standard GoTrue |

**RLS will continue to work unchanged.** The 44 policies and the `private.*`
SECURITY DEFINER helpers are plain Postgres. The `on_auth_user_created` trigger on
`auth.users` behaves identically in self-hosted Supabase.

---

## 3. Migration steps, in order

### Step 0 — Install Docker Desktop *(prerequisite, currently missing)*
Verified absent. `supabase start` cannot run without it. Enable the WSL2 backend.
**Do not proceed until `docker info` succeeds.**

### Step 1 — Back up the cloud database *(do this first, always)*
```bash
supabase login
supabase link --project-ref yuhqddiebzgcscorgauq
supabase db dump -f backup_roles.sql --role-only
supabase db dump -f backup_schema.sql
supabase db dump -f backup_data.sql --data-only --use-copy
```
Include `auth.users`, or **every account is lost**:
```bash
supabase db dump -f backup_auth.sql --data-only --schema auth
```
Verify non-trivial file sizes before continuing.

### Step 2 — Start local Supabase
```bash
supabase init      # keep existing config.toml
supabase start
```
Prints local URL (`http://127.0.0.1:54321`), anon key, service_role key, and
Studio (`:54323`). Inbucket mail catcher on `:54324`.

### Step 3 — Apply schema
```bash
supabase db reset     # replays all 17 migrations in order
```
Idempotent and self-verifying. **This also applies the currently-missing
`20260806100000_teacher_account_provisioning.sql`**, resolving the
`password_change_required` / `audit_log` gap from the previous audit.

### Step 4 — Import data
Restore `auth.users` **before** public data (FKs and the trigger depend on it):
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f backup_auth.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f backup_data.sql
```
⚠️ `on_auth_user_created` fires on `auth.users` insert and will **auto-create
profile/role/teacher rows**, colliding with `backup_data.sql`. Disable it during
import:
```sql
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
-- ... run both imports ...
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
```
This is the single most error-prone step in the whole migration.

### Step 5 — Repoint environment
`.env` (public values, safe to commit):
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key>
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<local anon key>
```
`.env.local` (**gitignored** — verified at `.gitignore:28`):
```
SUPABASE_SERVICE_ROLE_KEY=<local service_role key>
```
Never `VITE_`-prefix the service key; that ships it to the browser.

### Step 6 — Verify
Sign-in, RLS isolation, teacher provisioning, forced password change. See §10.

### Step 7 — *(Optional, defer)* Replace the Lovable build package
Only after everything above is green and committed. It is inert locally, so this
buys tidiness, not independence.

---

## 4. Risks per step

| Step | Risk | Severity | Mitigation |
|---|---|---|---|
| 0 | Docker/WSL2 issues on Windows | Med | Resolve before touching data |
| 1 | Dump omits `auth.users` → all logins lost | **Critical** | Dump auth explicitly; check file size |
| 3 | `db reset` wipes local data | Low | Only ever run against local |
| 4 | **Trigger double-insert / PK collisions** | **High** | Disable `on_auth_user_created` during import |
| 4 | Password hashes not carried over | **Critical** | Dump `auth.users` **with** `encrypted_password` |
| 5 | Service key committed to git | **Critical** | `.env.local` only — `.env` is *not* gitignored |
| 5 | Stale JWTs after key swap | Low | Sign out; clear localStorage |
| 6 | Email flows fail silently | Med | Expected — use Inbucket (§8) |
| 7 | Build breaks | Med | Defer; separate commit |

**The two Critical data risks both live in Steps 1 and 4.** Everything else is recoverable.

---

## 5. Estimated effort

| Step | Effort |
|---|---|
| 0 — Docker install | 30–60 min (mostly download/restart) |
| 1 — Backups | 15 min |
| 2 — `supabase start` | 10–20 min (first image pull) |
| 3 — Schema | 5 min |
| 4 — Data import | **1–2 h** — the real work |
| 5 — Env repoint | 10 min |
| 6 — Verification | 45 min |
| **Subtotal** | **3–5 hours** |
| 7 — Replace build package *(optional)* | +2–4 h |

Assumes no surprises in Step 4. Budget a half-day.

---

## 6. What data must be exported

| Data | Source | Critical? |
|---|---|---|
| **`auth.users`** (incl. `encrypted_password`) | auth schema | **Yes — accounts lost otherwise** |
| `auth.identities` | auth schema | Yes, if any OAuth provider is used |
| 16 public tables | public schema | Yes |
| Roles/grants | `--role-only` dump | Yes |
| Storage objects | — | **No — storage is unused** |
| Edge functions | — | **No — none exist** |

I could not read row counts: the anon key returns `401/42501` on every table
(RLS working as designed). Export requires your service-role key or DB password.

---

## 7. Secrets to regenerate

| Secret | Action |
|---|---|
| Local anon key | Auto-generated by `supabase start` — copy out |
| Local `service_role` key | Auto-generated — put in `.env.local` |
| **Cloud service-role key** | **Rotate in the Supabase dashboard** once cloud is retired |
| Cloud anon key | Becomes irrelevant; rotate on rotation of the above |
| JWT secret | Local default is fine for dev; generate a strong one for any shared deploy |

Local default keys are **well-known and identical for every developer**. Acceptable
for local dev; never for anything internet-reachable.

---

## 8. Features that may temporarily stop working

| Feature | Impact | Resolution |
|---|---|---|
| **Password reset email** ([supabase-auth-service.ts:70](src/services/auth/supabase-auth-service.ts#L70)) | No real email sent | Inbucket at `:54324` catches it |
| **Signup confirmation email** ([:53](src/services/auth/supabase-auth-service.ts#L53)) | Same | Inbucket, or `enable_confirmations = false` |
| **Leaked-password protection** | Not available locally | Expect weak demo passwords to be accepted — a *behaviour change*, verify prod separately |
| Teacher provisioning | **Works** — `email_confirm: true` bypasses email | — |
| Storage / Realtime | No impact — unused | — |

Email is the only genuine functional gap, and Inbucket covers local development.

---

## 9. Migrating without data loss

1. **Never destructive-touch the cloud project** until local is fully verified. Keep it read-only as a fallback.
2. **Back up before every step** (Step 1 first, always).
3. **Import `auth.users` before public tables** — FKs and the trigger depend on it.
4. **Disable `on_auth_user_created` during import** — otherwise it fabricates duplicate rows.
5. **Reconcile row counts** per table, cloud vs local, before trusting the result.
6. **Verify a real login** — proves password hashes survived. A restored row with a broken hash looks fine until someone tries to sign in.
7. **Keep dumps off git** — they contain password hashes and PII.
8. Retire the cloud project only after local runs clean for a few days.

---

## 10. Final independence checklist

**Environment**
- [ ] `docker info` succeeds
- [ ] `supabase start` healthy; Studio reachable at `:54323`
- [ ] `.env` points only at `127.0.0.1`
- [ ] `grep -rn "supabase.co\|yuhqddiebzgcscorgauq" src/ .env` → **0 hits**
- [ ] `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` only; `git check-ignore .env.local` passes

**Schema & data**
- [ ] 17/17 migrations applied
- [ ] 16 tables, 8 enums, 16 functions, 19 triggers, 44 policies present
- [ ] `profiles.password_change_required` exists *(currently missing in cloud)*
- [ ] `audit_log` exists *(currently missing in cloud)*
- [ ] Row counts reconcile per table

**Functional**
- [ ] Existing user signs in with their **old** password (hashes survived)
- [ ] Student sees only level+stream-matching groups; forced enrolment → 403 (RLS intact)
- [ ] Admin creates a teacher → credentials dialog shows a 16-char password
- [ ] `auth.admin.createUser` reached — profile + role + teachers row created atomically
- [ ] New teacher forced to `/change-password`; flag clears after change
- [ ] `audit_log` row written, containing **no** password
- [ ] Password-reset mail lands in Inbucket

**Independence**
- [ ] Full app works with **network disabled** (proves no cloud calls)
- [ ] `npx vite build` succeeds offline
- [ ] No `.env` references a `*.supabase.co` host
- [ ] Cloud service-role key rotated; cloud project retired

**Residual, technically required** *(acceptable — not runtime coupling)*
- [ ] `@lovable.dev/vite-tanstack-config` — build-time only, no network, sandbox plugins inert
- [ ] `window.__lovableEvents` — optional-chained; no-op when absent
- [ ] `AGENTS.md` block, `bunfig.toml` hint — documentation only

Passing every box above except the last group = **100% runtime independence from
Lovable Cloud**. The last group is build tooling with no network behaviour, removable
later at your convenience via Step 7.

---

## Recommendation

Do Steps 0–6 (3–5 h) and stop. That achieves every goal you listed: local database,
local Auth, local Storage capability, working RLS, working Server Functions, working
teacher provisioning, no runtime cloud dependency.

Defer Step 7. Swapping the Vite config package is the riskiest change relative to its
benefit — it touches the build for a package that makes no network calls and is
already inert on your machine.

One decision to make before Step 4: whether you want the **cloud data** migrated at
all, or a **clean local database** seeded with demo accounts. If the cloud data is
disposable test data, skip Steps 1 and 4 entirely — that removes both Critical risks
and cuts the migration to about 90 minutes.
