# Deployment Checklist — Madrasti SMS (first beta)

Target: **Vercel** (from GitHub `alaednz-star/edu`, branch `main`)
Backend: **Supabase** `ikowzxluqkbmibkafsfl`

Status: repository pushed, build verified. **Nothing deployed yet.**

---

## 1. Vercel environment variables

Set these in **Project → Settings → Environment Variables**, scope
**Production** (and Preview if you want previews to work).

| Name | Value | Exposed to browser? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://ikowzxluqkbmibkafsfl.supabase.co` | yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | production publishable / anon key | yes |
| `VITE_SUPABASE_PROJECT_ID` | `ikowzxluqkbmibkafsfl` | yes |
| `SUPABASE_URL` | `https://ikowzxluqkbmibkafsfl.supabase.co` | no (SSR) |
| `SUPABASE_PUBLISHABLE_KEY` | same publishable key as above | no (SSR) |
| `SUPABASE_SERVICE_ROLE_KEY` | production **service role** key | **NO — never** |

Both prefixes are required. `VITE_*` is inlined into the client bundle at build
time; the unprefixed copies are read by the SSR server at runtime
(`src/integrations/supabase/client.ts` falls back to them when rendering on the
server).

### About the service role key

It is **required**, not optional: creating a teacher account calls
`auth.admin.createUser`, which only the service role may do
(`src/features/teachers/provisioning.server.ts`). Without it, the app runs but
teacher provisioning fails.

It is read only inside `.server.ts` modules, which never reach the client
bundle. Set it in Vercel as a normal (non-`VITE_`) variable and never put it in
any committed file.

---

## 2. Database — apply migrations to production

The production project has **not** been migrated. 26 migrations must be applied
in filename order, from `supabase/migrations/`.

```bash
supabase link --project-ref ikowzxluqkbmibkafsfl
supabase db push
```

Two of them must not be reordered or merged:

- `20260806155000_teacher_lifecycle_enums.sql` then
  `20260806160000_teacher_lifecycle.sql` — split deliberately, because Postgres
  cannot *use* a new enum value in the same transaction that adds it (`55P04`).

After pushing, create the real accounts on production the same way they were
created locally, through the audited provisioning path — **not** by copying rows
from the local database (the local `auth.users` rows carry local-only password
hashes and identity records).

---

## 3. Supabase Auth settings

**Authentication → URL Configuration**

| Setting | Value |
|---|---|
| Site URL | `https://<your-vercel-domain>` |
| Redirect URLs | `https://<your-vercel-domain>/**` |

The app builds password-reset links from `window.location.origin`
(`src/routes/dashboard.profile.tsx:87`), so the deployed origin must be
allow-listed or reset emails will fail with `redirect_to not allowed`.

Add the Vercel preview domain too if you want previews to authenticate.

**Authentication → Providers**: Email is the only provider in use. No OAuth
configuration required for this beta.

**Email confirmation:** staff accounts are created with `email_confirm: true`,
so they never need to confirm. Public student signup *does* send a confirmation
mail. On Supabase's built-in SMTP this is rate-limited (a few per hour) — fine
for a demo, but configure custom SMTP before real student intake.

---

## 4. Storage

**Nothing to configure.** The app makes no `storage.from()` calls. `avatar_url`
exists on `profiles` but is never written to by the current UI.

---

## 5. RLS verification (post-deploy)

RLS is enforced by the migrations, so it applies automatically once they are
pushed. Confirm on production after deploying:

- Every table under `public` reports `rowsecurity = true`
- A teacher cannot read `audit_log`
- A teacher cannot write attendance for another teacher's group
- An anonymous request to `/rest/v1/profiles` returns no rows

These are exactly the checks the local suites run, and they passed locally.

---

## 6. Post-deploy smoke test

1. Sign in as `kenza@gmail.com` — the forced password change must appear
2. Dashboard loads with 7 groups and 3 teachers
3. Switch language to العربية — the sidebar must move to the right
4. Deep-link refresh (`/dashboard/groups` reloaded directly) must return 200,
   not 404 — this is what the Vercel preset fixes
5. Browser console clean

---

## What I could not verify

I have **no credentials for `ikowzxluqkbmibkafsfl`** — not even the anon key —
so its database, auth settings and RLS state are unverified. Everything above
about the production project is derived from the code and the local database,
not observed on it.
