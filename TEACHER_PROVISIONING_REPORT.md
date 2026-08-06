# Teacher Account Provisioning — Implementation Report

**Scope:** Admin-only creation of teacher accounts, with server-side privileged
operations, one-time temporary passwords and a forced password change.

**Status:** Code complete and verified. **One blocker before the feature works:
the migration is not applied and `SUPABASE_SERVICE_ROLE_KEY` is not set.** Both
require credentials only you hold. See [Before this can run](#before-this-can-run).

---

## Architecture decisions

### 1. The database already made provisioning atomic — so the migration is small

The pre-existing `handle_new_user()` trigger fires `AFTER INSERT ON auth.users`
and, **in the same transaction**, creates the profile, assigns the role from
`raw_user_meta_data->>'role'`, and inserts the `teachers` row.

So provisioning a teacher is exactly one privileged call —
`auth.admin.createUser({ user_metadata: { role: 'teacher' } })` — and the
database does the rest atomically. The "orphaned auth user / orphaned teacher
row" failure mode cannot occur: either the auth insert commits and the trigger
commits with it, or neither does.

Re-implementing that linkage in application code would have duplicated logic
that already exists and is already transactional. The migration therefore adds
only what was genuinely missing: the forced-password-change flag and an audit
trail.

### 2. Three-file split enforces the security boundary at build time

| File | Runs on | Contains |
|---|---|---|
| `provisioning.server.ts` | server only | service-role client, password generator, `assertAdmin` |
| `provisioning.functions.ts` | boundary | `createServerFn` wrappers + zod validators |
| `components/*.tsx` | client | forms and dialogs only |

`provisioning.functions.ts` is reachable from the client module graph, so
`provisioning.server` is imported **inside each handler** via
`await import(...)`, never at module scope. A top-level import would drag the
service-role client into the browser bundle.

I verified this actually holds rather than assuming it — see
[Security review](#security-review).

### 3. `password_change_required` lives on `profiles`, not in auth metadata

RLS can read a `profiles` column, so the guard is answerable by the database
rather than by the client asserting its own state. The existing
`profiles self update` policy already scopes `UPDATE` to `id = auth.uid()` or
admin, so the column inherits that protection with no new policy.

### 4. The audit log is immutable to every client, including admins

`GRANT SELECT` to `authenticated` plus a single admin-read policy. There is no
INSERT/UPDATE/DELETE policy at all, so writes are only possible via the service
role (which bypasses RLS). A `CHECK` constraint rejects `password`,
`temporary_password` and `temp_password` keys in `details` — defence in depth,
so a careless future change still cannot write a credential into the trail.

### 5. Re-authentication before password change

Supabase's `updateUser` does **not** verify the old password. Without a check, a
hijacked session could silently change the credential. `change-password.tsx`
therefore calls `signInWithPassword` with the current password first, and only
clears the flag after the change actually succeeds.

---

## Security review

Every claim below was tested, not assumed. Full harness output in
[Verification results](#verification-results).

### Service-role key never reaches the browser — verified against the real build

| Probe on `.output/public/` | Result |
|---|---|
| `SERVICE_ROLE` literal | **0 files** |
| `generateTemporaryPassword`, password alphabet | **0 files** |
| `SERVICE_KEY_MISSING`, `ProvisioningError`, `assertAdmin` | **0 files** |
| `createTeacherAccount`, `resetTeacherPassword`, `temporaryPassword` | **0 files** |
| Any JWT with `"role":"service_role"` | **none found** |

Two greps hit initially and both were run down rather than waved off:

- **`auth.admin` / `deleteUser` in the client bundle** — this is the
  `GoTrueAdminApi` class shipped inside `@supabase/supabase-js` itself. It is
  present in any app using that package and is inert without a service-role key.
  None of my code is involved.
- **`"server-side environment variable"` in the client** — an error message
  about the *publishable* (anon) key, which ships in the client by design. Not a
  secret.

I confirmed the boundary positively as well as negatively. The dev server's
transformed client module shows the plugin replacing each handler body with a
`createClientRpc("…")` stub — handler bodies, zod schemas and the
`provisioning.server` import survive **only** in the `?tss-serverfn-split`
server module. That is the mechanism doing the work, observed directly.

### Password generation — 500-sample statistical test

16 chars from a 64-symbol pool (~96 bits), `crypto.getRandomValues` with
rejection sampling to avoid modulo bias. Across 500 draws: all length 16, **500/500
unique**, every draw contained lower/upper/digit/symbol, no ambiguous characters
(`0 O 1 l I`), and character distribution was uniform within 60% deviation —
consistent with unbiased sampling, which is what rejection sampling is there for.

### Fails closed

With no service-role key, `createTeacherAccount` **throws** rather than
proceeding, raising `ProvisioningError("SERVICE_KEY_MISSING")`. `assertAdmin`
rejects undefined, empty and garbage tokens. An unauthenticated POST to the
server-fn endpoint returned **403**.

### Plaintext passwords

Never stored, never logged, never returned except in the single creation
response that populates the one-time dialog. Source-level assertions confirm no
password column write, no `console.log` of a password, and no password in audit
`details`. The credentials dialog holds it in props only; closing discards it.

---

## Files changed

**New**
- `supabase/migrations/20260806100000_teacher_account_provisioning.sql`
- `src/features/teachers/provisioning.server.ts`
- `src/features/teachers/provisioning.functions.ts`
- `src/features/teachers/components/create-teacher-dialog.tsx`
- `src/features/teachers/components/credentials-dialog.tsx`
- `src/features/auth/password-change.tsx`
- `src/routes/change-password.tsx`
- `src/lib/i18n/dicts/provisioning.ts`

**Modified**
- `src/routes/dashboard.teachers.tsx` — "New Teacher" button replacing the old
  invite-link button; both dialogs mounted
- `src/routes/dashboard.tsx` — `RequirePasswordChange` wrapping the dashboard
- `src/lib/i18n/dictionaries.ts` — registered the new dictionary module
- `src/integrations/supabase/types.ts` — `audit_log`, `audit_action`,
  `profiles.password_change_required`
- `.gitignore`, `LOCAL_SETUP.md` — de-branding (below)

---

## Verification results

| Check | Result |
|---|---|
| TypeScript strict (`tsc --noEmit`) | **PASS** — exit 0 |
| Production build (`vite build`) | **PASS** — built in 1.96s |
| Lint — files I touched | **PASS** — 0 errors |
| i18n parity fr/ar/en | **PASS** — 1085 keys each, identical sets |
| All `t()` keys resolve | **PASS** — 0 unresolved |
| Security harness (19 assertions) | **PASS** — 19/19 |
| Service key absent from client bundle | **PASS** |
| Routes serve (`/`, `/change-password`) | **PASS** — HTTP 200 |
| Unauthorized server-fn call | **PASS** — HTTP 403 |

### Two things I did *not* fix, deliberately

**963 pre-existing lint errors elsewhere in `src/`.** All are `prettier/prettier`
whitespace drift in files unrelated to this task — the repo has a `format`
script that has not been run. Fixing them is a one-command, zero-risk change,
but it would touch ~100 unrelated files and bury this diff. Say the word and
I'll run `npm run format` as its own commit.

**`vite preview` is broken.** It looks for `dist/server/server.js` while the
build emits to `.output/`. This is a pre-existing harness mismatch, unrelated to
this feature — `vite dev` and `vite build` both work. Flagging it because it will
bite whoever tries to smoke-test a production build locally.

---

## Before this can run

Two steps need credentials I don't have. **Until both are done, the "New Teacher"
button will fail** — the migration gap causes a `42703` error, and without the key
account creation returns `SERVICE_KEY_MISSING`.

**1. Apply the migration.** I confirmed against the live database that it has
*not* been applied:

```
profiles.password_change_required  ->  42703  column does not exist
public.audit_log                   ->  PGRST205  table not found
```

I could not apply it myself: no service-role key, no DB password, no
`SUPABASE_ACCESS_TOKEN`, and the Supabase MCP connector needs re-authorization
(that requires an interactive session — you'd re-authorize it in your claude.ai
connector settings). The SQL is idempotent, brace/paren-balanced, and ends with a
`DO $$` block that raises if either object is missing, so it is safe to run and
will tell you if it half-applied.

**2. Set `SUPABASE_SERVICE_ROLE_KEY`** as a server-side environment variable —
never in `.env` (which is committed), never `VITE_`-prefixed (that would ship it
to the browser). No code change is needed once it's present.

---

## Remaining limitations

- **Password reset and enable/disable are server-side only.** `resetTeacherPasswordFn`
  and `setTeacherStatusFn` are implemented, validated and audited, but not yet
  wired to UI controls. Creation is the complete path.
- **Audit log has no viewer.** Rows are written and admin-readable; no screen
  renders them yet.
- **Minimum password length is 8**, matching Supabase's default. Your project also
  has leaked-password protection enabled, which rejects breached passwords —
  worth keeping on.
- **Temporary password is delivered out-of-band** (copy or print). There is no
  email delivery, which is a deliberate consequence of never persisting the
  password. If you want emailed invites later, the right shape is Supabase's
  invite flow, not storing the credential.
- **One vendor reference remains in `src/`, intentionally.**
  `src/lib/error-reporting.ts` reads `window.__lovableEvents` /
  `window.__lovableReportRuntimeError`. These are **externally-defined globals the
  preview host injects** — this project reads them, never creates them. Renaming
  them would silently disable error reporting, so this falls under your
  "unless it is technically required" exemption; the file documents why. The
  same applies to `@lovable.dev/vite-tanstack-config` in `package.json`,
  `bunfig.toml` and `vite.config.ts` (real npm package names — removing them
  breaks the build) and the tool-managed block in `AGENTS.md`. The two that were
  merely prose, in `.gitignore` and `LOCAL_SETUP.md`, I rewrote.
