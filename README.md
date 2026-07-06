# My Recipes

A private recipe-management app for a small circle of family/friends. See `SPEC.md` for the full
product spec and `DECISIONS.md` for choices made where the spec was silent.

## Setup (local dev)

```bash
cp .env.example .env      # then fill in secrets (a default DATABASE_URL/BETTER_AUTH_SECRET work out of the box)
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed           # seeds the fixed category list
npx tsx lib/db/create-invite.ts   # bootstrap the first invite code (only needed once, before any user exists)
npm run dev
```

Open http://localhost:3000/signup and use the printed invite code to create the first account.
Every account after that can be invited by an existing member via `POST /api/invite/generate`
(authenticated) — a settings-page button for this lands in a later phase.

### Google OAuth

Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env` (from a Google Cloud Console OAuth
client) to enable "Continue with Google". Email/password works without it.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | yes | Random string, session/cookie signing |
| `BETTER_AUTH_URL` | yes | Base URL of the app |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `OPENROUTER_API_KEY` | no (Phase 1+) | LLM import fallback |
| `YOUTUBE_API_KEY` | no (Phase 1+) | YouTube description fetch; transcripts need no key |

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint` / `typecheck`
- `npm run db:generate` / `db:migrate` / `db:studio` / `db:seed`

## Backup & restore

(Documented fully once `/api/backup` ships in Phase 3/4: `pg_dump -Fc` + the uploads directory,
streamed as a single `.tar.gz`. Restore is `pg_restore` the dump and copy `uploads/` back into the
volume.)
