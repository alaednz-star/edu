# Phase 1 — UX & Reliability Hardening: Completion Report

**Date:** 2026-08-02
**Scope:** Reliability, feedback, and UX only. No redesign, no new business features.
**Database:** untouched. No migrations, no schema or policy changes.

---

## 0. A correction to the Phase 0 audit

The Phase 0 report claimed "`isError` appears **zero times**; query failures are invisible." That
conclusion came from grepping for the literal string `isError`, and it was **wrong**. Reading the
pages properly showed five of them already destructured `error` from React Query and passed it to
`DataTable`, which already had an error branch, skeletons, empty states, and memoised
filtering/sorting.

The real gaps were narrower and more specific than "no error handling":

1. Error text shown to users was the **raw Postgres/GoTrue message** — including SQL hints.
2. `DataTable`'s error branch rendered a bare red string with **no retry**.
3. Pages using `data: x = []` **swallowed** query errors, so a failed load looked like an empty list.
4. **No retry policy at all** — one dropped packet meant a permanently broken table.
5. Destructive actions had **no pending guard**, so a double-click fired two deletes.
6. Bulk approve/reject **claimed success before the mutations settled**.

TECH_DEBT.md item TD-2 has been updated to reflect this.

---

## 1. What changed

### 1.1 New: `src/lib/errors.ts` — error classification

Maps backend failures to i18n keys and decides retriability. Handles PostgREST codes
(`PGRST301`, `PGRST116`), Postgres SQLSTATEs (`42501` RLS, `23505` duplicate, `23503` FK in use,
`23514` check, `40001`/`40P01` conflict, `42883` — the Phase 0 outage signature), HTTP statuses,
and GoTrue's prose messages ("Invalid login credentials", "User already registered").

Anything unrecognised falls back to a generic message. **The raw backend string is never shown.**

Verified against a response captured live from the production API:

```json
{"code":"42501","hint":"Grant the required privileges to the current role with:
 GRANT SELECT ON public.profiles TO anon;","message":"permission denied for table profiles"}
```

→ renders as *"You don't have permission to do that."* The SQL hint and the table name are both
suppressed, and it is correctly classified **non-retriable**.

### 1.2 New: `src/hooks/use-action-feedback.ts`

`notifySuccess(key)` / `notifyError(error)` — a single place for action feedback so no page can
reintroduce a raw error toast.

### 1.3 New: `src/components/common/error-state.tsx`

The "we could not load this" surface, with a **Retry** button wired to React Query's `refetch`.
Distinguishing "no students yet" from "we couldn't load students" is the central fix of this phase.

### 1.4 New: `src/lib/i18n/dicts/feedback.ts`

31 keys × 3 locales. Every message says what happened and what to do next, in French, Arabic, and
English.

### 1.5 `src/router.tsx` — retry and caching (requirement 8)

```ts
staleTime: 60s · gcTime: 5min
queries:   retry up to 3× on transient failures, exponential backoff capped at 8s
mutations: retry once, only when the write cannot have been applied
refetchOnReconnect: true · refetchOnWindowFocus: false
```

Retries are gated on `isRetriableError`, so a 403 or a validation error fails immediately instead of
being hammered three times.

### 1.6 `ConfirmDialog` — pending state (requirements 3, 7)

`onConfirm` may now return a promise. While it is pending the dialog stays open, both buttons are
disabled, the confirm button shows a spinner and "Deleting…", and Esc/overlay dismissal is blocked.
Previously a double-click fired the mutation twice.

### 1.7 `DataTable` — error surface with retry

Replaced the bare red message with `ErrorState` + retry. Widened `error` from `Error | null` to
`unknown`, removing the `as Error | null` casts every caller was performing.

### 1.8 `dashboard.tsx` — route-level error boundary (requirement 9)

Added `errorComponent` at the dashboard layout. Scoped here rather than only at the root so the
sidebar and topbar survive a page crash — the user keeps their navigation instead of losing the
whole shell. Reports to the existing telemetry hook.

### 1.9 Bug fixed: bulk approve/reject reported success before completing

`bulkAct` fired N mutations and immediately showed "N approved" without awaiting any of them. A
failed batch displayed a success toast while nothing had been saved. Now uses `Promise.allSettled`
and reports the true counts, surfacing the first failure.

### 1.10 Bug fixed: teachers saw admin-only Groups controls

`dashboard.groups.tsx` admits teachers, but `groups` is admin-write-only in RLS. Teachers saw
create/edit/delete buttons whose writes the database always rejected. Now gated on
`hasRole("admin")` — the actions column, the header button, and the empty-state button. Teachers get
a clean read-only view. (This was M1/TD-9.)

### 1.11 Per-page wiring

All 10 dashboard pages plus the 4 auth forms. Query errors surfaced with retry; success and failure
feedback routed through the mapping layer; save buttons given spinners and "Saving…" labels; cancel
buttons disabled while saving; re-entrancy guards (`if (save.isPending) return`) on submit handlers.

New client-side validation: level position must be non-negative; centre name required; logo URL must
be `http(s)://`.

---

## 2. Requirement-by-requirement

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Failed requests show a clear, friendly error | **Done** — mapping layer + `ErrorState`; verified against a live production error |
| 2 | Successful actions show confirmation | **Done** — every mutation reports through `notifySuccess` |
| 3 | Destructive actions require confirmation | **Done** — deletes already had it; **added** for single and bulk registration reject |
| 4 | Loading states show a skeleton or spinner | **Done** — all 10 pages; settings gained a skeleton it never had |
| 5 | Empty states explain what to do next | **Done** — all list pages; icon, message, and a CTA where the user can act |
| 6 | Forms have proper validation | **Done** — auth via zod/react-hook-form; admin forms validate before submit |
| 7 | Submit buttons prevent duplicate submission | **Done** — `disabled` + re-entrancy guard + `ConfirmDialog` pending state |
| 8 | Network requests recover from temporary failures | **Done** — retry with backoff, retriable-only, refetch on reconnect |
| 9 | Global error boundary | **Done** — root boundary already existed; **added** dashboard-scoped boundary |
| 10 | No dead buttons, broken dialogs, inconsistent interactions | **Done** — audited all 10 pages; found and fixed the teacher/Groups dead controls |

### Per-page final state

```
                 error  loading  empty  success  failure  confirm  pending
overview           Y       Y       Y       -        -        -        -
levels             Y       Y       Y       Y        Y        Y        Y
subjects           Y       Y       Y       Y        Y        Y        Y
students           Y       Y       Y       Y        Y        -        Y
teachers           Y       Y       Y       Y        Y        -        Y
groups             Y       Y       Y       Y        Y        Y        Y
registrations      Y       Y       Y       Y        Y        Y        Y
attendance         Y       Y       Y       Y        Y        -        Y
settings           Y       Y       -       Y        Y        -        Y
registration       Y       Y       Y       Y        Y        -        Y
```

`confirm: -` was verified as correct, not missing: students, teachers, attendance, settings and
registration have **no destructive actions** (confirmed by searching for delete/remove handlers).
`empty: -` on settings is correct — it is a singleton form, never a list. The overview has no
mutations, so it has no action feedback.

---

## 3. Verification

| Check | Result |
| --- | --- |
| `tsc --noEmit` (strict) | **Pass**, 0 errors |
| `npm run lint` | **0 logic errors** (only the 8 pre-existing `react-refresh` warnings) |
| `npm run build` | **Pass** |
| Dev server, all 14 routes | **200**, no runtime errors in the log |
| i18n parity fr/ar/en | **703 / 703 / 703** — none missing, none extra |
| Every `t()` key resolves | **Pass** — no missing translations anywhere in `src/` |
| Error-mapping unit checks | **13 / 13 pass** (RLS, duplicate, FK, check, 42883, JWT, auth, network, 5xx, 429, deadlock, unknown) |
| Live production error | Maps to a friendly message; **SQL hint and table name suppressed** |

---

## 4. Remaining blockers

**None introduced.** No regressions: typecheck, lint, and build all match or improve on the Phase 0
baseline.

### Known limitations of this pass

1. **No browser click-through.** Behaviour was verified by reading every page, unit-testing the
   mapping layer, and confirming all routes render. I did not drive the UI in a real browser, so
   spinner timing and dialog focus behaviour are inferred, not observed.
2. **Teacher-facing changes are untested with real data** — there are still zero teachers in the
   database. The Groups read-only gating is correct by construction but unexercised.
3. **`error.sessionExpired` does not force a re-login.** An expired JWT shows the right message but
   does not redirect to `/login`. That belongs with the route-guard work (TD-6) rather than here.
4. **Mutation retry is conservative** — one attempt, only for failures that cannot have been
   applied. Registration/attendance writes are not idempotent, so retrying more aggressively risks
   duplicates. Safe idempotency keys would be a Phase 3 concern.

### Carried forward, unchanged

Server-side validation (H3/TD-5), `beforeLoad` route guards (H1/TD-6), CSV formula injection
(M2/TD-10 — untouched, still open), pagination and SQL-side joins (TD-7), splitting `queries.ts`
(TD-8), and the RLS test suite (TD-22).

---

## 5. Files changed

```
NEW  src/lib/errors.ts
NEW  src/lib/i18n/dicts/feedback.ts
NEW  src/hooks/use-action-feedback.ts
NEW  src/components/common/error-state.tsx
NEW  PHASE_1_REPORT.md

MOD  src/router.tsx                              retry, backoff, staleTime
MOD  src/routes/dashboard.tsx                    route-level error boundary
MOD  src/components/common/confirm-dialog.tsx    pending state
MOD  src/components/common/data-table.tsx        ErrorState + retry
MOD  src/lib/i18n/dictionaries.ts                register feedback module
MOD  src/lib/i18n/dicts/{adminForms,dashboard,entities}.ts   new keys ×3 locales
MOD  src/routes/dashboard.{index,levels,subjects,students,teachers,groups,
                           registrations,attendance,settings,registration}.tsx
MOD  src/routes/{forgot-password,reset-password}.tsx
MOD  src/features/auth/components/{login-form,register-form}.tsx
```

Database: **no changes**.
