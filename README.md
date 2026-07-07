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
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL (also a Docker build arg) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `OPENROUTER_API_KEY` | no (Phase 1+) | LLM import fallback |
| `OPENROUTER_MODEL` | no | Overrides the default import model |
| `YOUTUBE_API_KEY` | no (Phase 1+) | YouTube description fetch; transcripts need no key |
| `ALEXA_API_TOKEN` | no (Phase 4+) | Shared-secret bearer token for `/api/alexa/*` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | yes (docker-compose) | Postgres container credentials |
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PORT` | no | `deploy.sh` only — not read by the app |

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint` / `typecheck` / `test`
- `npm run db:generate` / `db:migrate` / `db:studio` / `db:seed`

## Deployment

Self-hosted via Docker, mirroring `yarg-aggregator`'s pattern: `Dockerfile` (multi-stage,
`output: "standalone"`) + `docker-compose.yml` with two services (`my-recipes` + `postgres`).

```bash
cp .env.example .env   # fill in real secrets — this is the file docker-compose reads from
docker compose up -d --build
```

The container entrypoint (`docker-entrypoint.sh`) waits for Postgres, runs pending Drizzle
migrations, and re-runs the (idempotent) category seed on every start — no manual migration step
needed after the first deploy. Recipe photos persist in the `uploads_data` volume across
redeploys.

Health check: `GET /api/health` (also used by docker-compose's own healthcheck and `deploy.sh`).

### deploy.sh

For deploying to a remote host over SSH (bumps the version, pushes to `main`, then rebuilds and
restarts just the app container on the remote — Postgres stays up):

```bash
./deploy.sh              # deploy
./deploy.sh --rollback   # restart the remote's previous image without rebuilding
```

Requires `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PORT` in `.env` and that `~/my-recipes` (or
wherever `REMOTE_DIR` points) on the remote host already has this repo cloned with its own `.env`.

## Backup & restore

**Settings → Download backup** (or `GET /api/backup`) streams a `my-recipes-backup-YYYY-MM-DD.tar.gz`
containing `db.dump` (a `pg_dump -Fc` custom-format dump) and everything under `uploads/`.

**⚠️ Treat every backup archive as a secret.** `db.dump` is a full, unfiltered dump of the
database — it includes the `account` table (password hashes, and OAuth access/refresh tokens for
anyone who signed in with Google) and the `session` table (live session tokens, valid until they
expire, that could be replayed to hijack a signed-in session). Store archives the same way you'd
store a password vault export: not in a shared/public Drive folder, not emailed unencrypted.

**Requires `pg_dump` on the app host matching the Postgres server's major version** (16, per
`docker-compose.yml`) — a mismatched client refuses to dump and the route returns a 500. The
Docker image installs `postgresql16-client` for exactly this reason; for local dev outside
Docker, make sure whatever `pg_dump` is on your `PATH` is v16.

**`/api/backup` requires a logged-in session** (like every other route), so it can't be curled
unattended for a nightly/cron backup without first scripting a login. For automated backups, skip
the HTTP route entirely and `pg_dump` the Postgres container directly instead:

```bash
docker exec my-recipes-postgres pg_dump -U postgres -Fc my_recipes > "my-recipes-$(date +%F).dump"
```

This produces the same `-Fc` format as `db.dump` inside the app's own backup archive (restorable
the same way below) but skips `uploads/` — pair it with a separate `rsync`/`tar` of the
`uploads_data` volume if photos need to be included in unattended backups too.

To restore:

```bash
tar xzf my-recipes-backup-2026-01-01.tar.gz
pg_restore -h <host> -U <user> -d <target-db> db.dump   # target db must already exist and be empty
cp -r uploads/* /path/to/uploads/                        # copy back into the app's uploads volume
```

Verified end-to-end during development: restored a real export into a scratch database and
confirmed all rows came back intact.

## Alexa API surface (§9.1)

Hooks-only in v1 — no skill is built or published, just a thin, token-authenticated JSON surface
so a future skill can be added without schema/API churn:

- `GET /api/alexa/active-recipe` — active recipe, scaled ingredients, current step
- `POST /api/alexa/step` — `{ "action": "next" | "previous" | "jump", "index"? }`
- `GET /api/alexa/quantity?ingredient=farinha` — scaled quantity for one ingredient
- `POST /api/alexa/shopping-list` — `{ "name", "quantity"?, "unit"? }`, adds to the most
  recently generated shopping list across the circle

All four require `Authorization: Bearer <ALEXA_API_TOKEN>`. There's no per-device pairing yet
(that's §9.2, future work) — every request uses the same shared secret, which is an acceptable
simplification for a private single-household app. See `DECISIONS.md` for the reasoning.
