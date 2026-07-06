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
Every account after that can be invited by an existing member from **Settings → Invite someone**.

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

**Settings → Download backup** (or `GET /api/backup`) streams a `my-recipes-backup-YYYY-MM-DD.tar.gz`
containing `db.dump` (a `pg_dump -Fc` custom-format dump) and everything under `uploads/`.

**Requires `pg_dump` on the app host matching the Postgres server's major version** (16, per
`docker-compose.yml`) — a mismatched client refuses to dump and the route returns a 500. In the
Docker image (Phase 4) this is guaranteed by installing `postgresql-client` for the same major
version; for local dev outside Docker, make sure whatever `pg_dump` is on your `PATH` is v16.

To restore:

```bash
tar xzf my-recipes-backup-2026-01-01.tar.gz
pg_restore -h <host> -U <user> -d <target-db> db.dump   # target db must already exist and be empty
cp -r uploads/* /path/to/uploads/                        # copy back into the app's uploads volume
```

Verified end-to-end during Phase 3 development: restored a real export into a scratch database
and confirmed all rows came back intact.
