# Local Setup

Everything needed to run Madrasti on your machine. Verified 2026-08-03 on
Windows 11, Node v24.18.1.

---

## 1. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| **Node.js** | **≥ 22** | `@supabase/supabase-js` requires `>=22`, Vite 8 requires `^20.19 \|\| >=22.12`. You have **v24.18.1** — fine. |
| **npm** | ≥ 10 | Ships with Node. You have 11.16.0. |
| Git | any | |
| Supabase account | — | **Not required.** The app uses the existing hosted project. |

### A note on the package manager

The repo contains **`bun.lock`**, but **Bun is not
installed on your machine** and npm works fine. Both were verified: `npm install`
completes with 0 vulnerabilities, and typecheck and build both pass.

**Use npm.** One caveat: npm resolves a slightly different tree than `bun.lock`
describes, so if you later install Bun, prefer `bun install` for parity with the
CI build. Do not commit a `package-lock.json` — it would create a second
source of truth alongside `bun.lock`.

---

## 2. Commands — from a clean terminal

```bash
cd "C:/Users/ALA/Documents/GitHub/Academium Foundation"
npm install
npm run dev
```

That's it. No database setup, no Supabase CLI, no Docker.

### The URL

```
http://localhost:8080/
```

**Not** 3000 or 5173. The port comes from the shared Vite config
which `vite.config.ts` extends — it is not set in this repo.

### Other scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR on :8080 |
| `npm run build` | Production build into `.output/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (**warning:** rewrites ~678 files — commit first) |
| `npx tsc --noEmit` | Typecheck only |

---

## 3. Environment variables

`.env` is **already committed and correct** — nothing to create. You do not need
a `.env.local`.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase API endpoint. `VITE_`-prefixed vars are inlined into the browser bundle by Vite. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The **anon** key. Public by design — it carries no privileges of its own; Row Level Security decides everything. |
| `VITE_SUPABASE_PROJECT_ID` | Project reference, used by tooling. |
| `SUPABASE_URL` | Same URL, read during **server-side rendering** where `import.meta.env` is unavailable. |
| `SUPABASE_PUBLISHABLE_KEY` | Same key, for SSR. |
| `SUPABASE_PROJECT_ID` | Same id, for SSR. |

`src/integrations/supabase/client.ts` reads `import.meta.env` first and falls
back to `process.env`, which is why each value appears twice.

### Never add this to `.env`

`SUPABASE_SERVICE_ROLE_KEY` **bypasses Row Level Security completely**. `.env` is
committed to git, so a service-role key placed there would be published. If you
ever need it, set it as a platform secret. `.gitignore` already blocks
`.env.local`, `.env.production`, `*.key`, `*.pem`.

---

## 4. Database

**No local database.** The app talks to the hosted Supabase project, the same one
the published site uses.

### Migrations

All 10 migrations in `supabase/migrations/` are **already applied** to that
project. There is nothing to run.

Migrations are applied through the Supabase dashboard rather than a local CLI. To apply a new one manually: **Supabase Dashboard → SQL Editor → New query →
paste → Run**.

> Because this is the live project, data you create while testing is real data.
> The demo accounts below are all on `@madrasti.local` so they are easy to spot
> and remove — see §7.

---

## 5. Login credentials

Three permanent demo accounts, created through Supabase Auth with profiles,
roles, and demo data attached.

### Admin
```
Email:    admin@madrasti.local
Password: Madrasti#Admin2026
```

### Teacher
```
Email:    teacher@madrasti.local
Password: Madrasti#Teacher2026
```

### Student
```
Email:    student@madrasti.local
Password: Madrasti#Student2026
```

> **Why not `Admin123!` as requested:** Supabase rejected all three of the
> originally specified passwords with `weak_password` — they appear in known
> breach corpora, and the project has leaked-password protection enabled. Rather
> than weaken a security setting on a live project, the passwords keep the same
> shape but pass the check. Everything else is exactly as specified.

There are also seven classmate accounts (`demo.eleve1@madrasti.local` …
`demo.eleve7@madrasti.local`, password `Madrasti#Demo2026x<N>`) that exist purely
to populate rosters. You will not normally log in as them.

---

## 6. What each dashboard shows

Verified by logging in through the real auth API and querying as each role.

| | Admin | Teacher | Student |
| --- | --- | --- | --- |
| Profiles visible | 12 | 9 | **1** (own) |
| Students visible | 9 | 8 | 1 |
| Registrations | 12 | 10 | 3 |
| Attendance rows | 108 | 108 | 24 |
| Private notes | 1 | 1 | **0** |

The student seeing **1 profile and 0 notes** is the RLS working: a note exists
about them, written by the teacher, and they cannot read it.

**Admin** — full dashboard: 9 students, 3 groups, 2 pending requests to triage,
occupancy, today's sessions, and a *Students at risk* widget with four genuinely
below-threshold students (42–58%).

**Teacher** (Yacine Haddad) — 2 assigned groups (Maths 4AM, Physique 1AS),
2 subjects, weekly timetable, 8 students under *My students*, attendance to mark,
and 2 unread notifications.

**Student** (Lina Cherif) — 2 approved groups, 1 pending request, weekly
schedule, 24 attendance records at **88%** with all four statuses represented,
and 1 unread notification.

---

## 7. Resetting

### Reset demo data only (keeps your real accounts)

Supabase Dashboard → SQL Editor → paste **`scripts/reset-demo-data.sql`** → Run.

It deletes only rows tied to `@madrasti.local` accounts plus the three demo
groups. Your real accounts, the 12 levels, 5 subjects, and `center_settings` are
untouched. The script prints a verification table at the end.

### Re-seed after a reset

1. Recreate the auth accounts — Supabase Dashboard → **Authentication → Users →
   Add user**, with **Auto Confirm** ticked, using the emails in §5. (Auth users
   cannot be created from SQL; passwords must be hashed by Supabase Auth.)
2. Run **`scripts/seed-demo-data.sql`** in the SQL editor.

### Reset the local project only

```bash
rm -rf node_modules .output .wrangler .tanstack .nitro
npm install
npm run dev
```

Safe — none of those directories are tracked by git, and none touch the database.

---

## 8. Troubleshooting

**Port 8080 already in use**
```bash
netstat -ano | findstr :8080          # find the PID
taskkill /F /PID <pid>
```

**Blank page, console shows "Missing Supabase environment variables"**
`.env` is missing or was emptied. Restore it from git: `git checkout .env`.
Restart the dev server — Vite only reads `.env` at startup.

**Login fails with "Incorrect email or password"**
The demo accounts live on the **remote** project. Confirm `.env` points at
`https://yuhqddiebzgcscorgauq.supabase.co`, and check the account still exists
under Authentication → Users.

**Dashboard loads but every table is empty**
Check the notification bell and page error states first — since Phase 1, a failed
query shows an explicit error with a Retry button rather than an empty table. An
empty table genuinely means no data. If you reset the demo data, re-seed it.

**"Vous n'avez pas les droits nécessaires" on an admin page**
You are signed in as the wrong role. Sign out and back in as
`admin@madrasti.local`. Roles are cached in the session.

**Changes to `.env` not taking effect**
Vite inlines `VITE_*` at startup. Stop and restart `npm run dev`.

**Typecheck errors after adding a route**
`src/routeTree.gen.ts` is generated by the dev server. Start `npm run dev` once
to regenerate it, then re-run `npx tsc --noEmit`.

**`npm run format` produced a huge diff**
Expected — the repo has ~678 pre-existing Prettier violations (TD-14). Run it as
its own commit or not at all.

---

## 9. Verification record

Everything below was executed on 2026-08-03, not assumed.

| Check | Result |
| --- | --- |
| `npm install` | Clean, **0 vulnerabilities** |
| `npx tsc --noEmit` (strict) | **0 errors** |
| `npm run build` | **Pass** (3 build steps) |
| `npm run dev` | Ready in ~2 s on **:8080** |
| Startup errors in dev log | **0** |
| All 17 static routes | **HTTP 200** |
| Dynamic detail routes | **HTTP 200** with real seeded IDs |
| Admin login → role | **200 → admin** |
| Teacher login → role | **200 → teacher** |
| Student login → role | **200 → student** |
| RLS isolation per role | Verified — student sees 1 profile, 0 notes |

### Not verified

I did not click through the UI in a browser. Routes were confirmed to serve
HTTP 200 with no runtime errors, and every dashboard's underlying queries were
run as each role against the live API — but visual layout, RTL rendering, and
interactive flows are inferred from that, not observed. **That is exactly what
your manual testing session is for.**
