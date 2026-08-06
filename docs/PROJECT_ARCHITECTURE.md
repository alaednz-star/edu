# Project Architecture

**Product:** Academium Foundation (branded "Madrasti") — a school-management SaaS for private
tutoring centres in Algeria.
**Audited:** 2026-08-02. Every claim below was verified against the source tree, a clean
`npm install`, a passing `tsc --noEmit`, a successful production build, and live queries against
the Supabase database.

---

## 1. Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start 1.x (SSR, Nitro/Cloudflare target) |
| Router | TanStack Router (file-based, generated `routeTree.gen.ts`) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (new-york), Radix primitives |
| Server state | TanStack Query 5 |
| Backend | Supabase (Postgres + GoTrue auth), accessed directly from the browser |
| Validation | Zod 3 + react-hook-form |
| Build | Vite 8 |
| Package manager | Bun (`bun.lock`); npm works as a fallback |

TypeScript runs in genuinely strict mode — `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`. This is
stricter than most commercial codebases and is one of the project's real strengths.

## 2. Directory layout

```
src/
  components/
    ui/          58 shadcn primitives (~23 unused — see KNOWN_ISSUES)
    common/      10 app-level building blocks (data-table, stat-card, page-header, …)
    layout/      app-sidebar, dashboard-topbar, global-search
  config/        navigation.ts — single source of truth for menus + role visibility
  features/
    auth/        AuthProvider, RequireAuth guard, zod schemas
    marketing/   landing-page sections, mockups, scroll reveal
    school/      queries.ts (the entire data layer), types, schedule helpers, role overviews
  hooks/         use-auth, use-i18n, use-mobile, use-count-up, use-in-view
  integrations/
    supabase/    client (browser), client.server (service role), auth middleware + attacher
  layouts/       public / auth / dashboard shells
  lib/
    i18n/        provider, config, dictionaries split across 5 domain files
    error-*.ts   SSR error capture and fallback page
  routes/        file-based routes (18 files)
  services/auth/ AuthService interface + Supabase implementation
  types/         auth.ts, common.ts
supabase/
  migrations/    6 SQL migrations
```

The feature-oriented layout (`features/<domain>/`) with a shared `components/common` is a sound,
scalable structure. It is not the flat "everything in components/" shape typical of unrefined
generated projects — previous iterations clearly invested here.

## 3. Request / data flow

```
Browser ──► supabase-js (anon "publishable" key, user JWT attached)
                │
                └──► PostgREST ──► Postgres ──► RLS policies decide row visibility
```

**All reads and writes go directly from the browser to Supabase.** There are no server functions
performing data mutations. The auth middleware (`requireSupabaseAuth`) and the service-role client
(`client.server.ts`) exist and are correctly written, but **nothing in the application currently
calls them** — they are scaffolding for a server-side layer that was never built.

The consequence is architecturally decisive: **Row Level Security is the one and only enforcement
boundary in this product.** Client-side role checks are UX affordances, not security. Any gap in a
policy is directly reachable from a browser console.

## 4. Authentication & authorization

- `services/auth/auth-service.ts` defines an `AuthService` interface; `supabase-auth-service.ts`
  implements it; `services/auth/index.ts` is the single composition point. This dependency
  inversion is clean and makes the auth provider swappable.
- `AuthProvider` holds session state and exposes `hasRole` / `hasAnyRole`.
- On every sign-in, `hydrate()` issues two queries — `profiles` and `user_roles` — and collapses
  the result into a single `role` field using precedence `admin > teacher > student`.
- `RequireAuth` is a **client-side, render-time** gate. It runs after the bundle loads; it is not a
  `beforeLoad` router guard, so protected route code is downloaded before the check runs.

### Role model
Three roles (`admin`, `teacher`, `student`) stored in a dedicated `user_roles` table rather than on
the user record — the correct pattern, and it survives the JWT (roles are not trusted from client
claims; policies re-query the table).

Sign-up **always** creates a `student` (migration 3). The earlier version honoured a client-supplied
`role` from user metadata, which was a privilege-escalation hole; it was correctly closed. Note
that `signUp()` still sends `data: { role }` from the browser — that value is now silently ignored
by the database trigger, which is safe but misleading.

## 5. Data layer

`src/features/school/queries.ts` (639 lines) contains every hook: `useLevels`, `useSubjects`,
`useTeachers`, `useStudents`, `useGroups`, `useRegistrations`, `useAttendance`, `useCenterSettings`,
plus their mutations. Each mutation invalidates the relevant query keys through a central
`schoolKeys` registry.

The registry pattern and consistent invalidation are good. The file's size and its mixing of six
unrelated domains are the main structural weakness (see TECH_DEBT).

## 6. Internationalization

Three locales — French (default), Arabic (RTL), English — via a hand-rolled provider. Flat key
dictionaries are split across five domain modules. Direction and `lang` are applied to
`document.documentElement`; the signed-in user's choice is persisted to `profiles.locale` and
guests fall back to `localStorage`.

RTL support is real and deliberate, which matters for the Algerian market. The weakness is that
all three dictionaries ship in one eager 120 KB chunk (see PERFORMANCE).

## 7. Build & deployment

Vite builds through a shared wrapper config, which pre-installs TanStack Start, Tailwind, Nitro
(Cloudflare target), path aliases, and dev-only error plugins. `src/server.ts` wraps the SSR entry
to recover stack traces that h3 would otherwise swallow into an opaque 500. `src/start.ts`
re-registers CSRF protection for server functions (defining the file opts out of the automatic
install) and attaches the Supabase bearer token to server-function RPCs.

The project is deployed as a server-rendered application.

## 8. Verified baseline

| Check | Result |
| --- | --- |
| `tsc --noEmit` | Passes, zero errors |
| `npm run build` | Succeeds (~3.5 s) |
| `npm run lint` | 686 problems — 678 Prettier formatting, 8 benign fast-refresh warnings, **zero logic errors** |
| Client JS | ~1.18 MB uncompressed across all chunks |
| Secret leakage | **None.** No service-role key in the client bundle (verified by inspecting the matched bytes) |
