# Madrasti SMS

School management for Algerian tutoring centres. Students register online for
classes matching their academic level and stream; administrators manage groups,
teachers, registrations and attendance.

Trilingual (French, Arabic, English) with full RTL support.

## Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start (React 19, SSR) |
| Language | TypeScript, strict mode |
| Data | Supabase (PostgreSQL, Auth, Row Level Security) |
| Server state | TanStack Query |
| Styling | Tailwind CSS + shadcn/ui |
| Build | Vite 8 |

## Getting started

```sh
npm install
npm run dev
```

The app runs at **http://localhost:8080**.

Full setup, demo credentials and troubleshooting: [LOCAL_SETUP.md](LOCAL_SETUP.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with HMR |
| `npm run build` | Production build into `.output/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npx tsc --noEmit` | Typecheck only |

## Environment

`.env` holds the Supabase URL, project id and **publishable** (anon) key. Those
are public by design — they ship in the client bundle, and Row Level Security is
what actually protects the data.

**Never commit `SUPABASE_SERVICE_ROLE_KEY`.** It bypasses Row Level Security
entirely. Read it from a server-side environment variable only, never from a
committed file. See [.env.example](.env.example).

## Database

Schema and policies live in [supabase/migrations/](supabase/migrations/), applied
in filename order. Every table has Row Level Security enabled — security rules
are enforced in the database, not only in the UI.

## Documentation

| Document | Contents |
| --- | --- |
| [LOCAL_SETUP.md](LOCAL_SETUP.md) | Prerequisites, commands, credentials, troubleshooting |
| [docs/PROJECT_ARCHITECTURE.md](docs/PROJECT_ARCHITECTURE.md) | Structure and data flow |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, relationships, policies |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and audit findings |
| [TECH_DEBT.md](TECH_DEBT.md) | Prioritised technical debt register |
