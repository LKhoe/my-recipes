# My Recipes

A private recipe-management app for a small circle of family/friends. See `SPEC.md` for the full
product spec and `DECISIONS.md` for choices made where the spec was silent. Deployment to the
Raspberry Pi is in `DEPLOY.md`.

## Local development

Postgres and photo storage (S3, Garage) come from [LocalInfra](../LocalInfra) — the same shared
stack that runs on the Pi — running on Docker Desktop.

```bash
# 1. LocalInfra on Docker Desktop (from ../LocalInfra; see its README section 7)
BACKUP_DIR=./backups-local S3_DATA_DIR=./s3-local DOCKER_CONTEXT=desktop-linux docker compose up -d --build
DOCKER_CONTEXT=desktop-linux scripts/new-project.sh my_recipes --no-redis --s3   # prints DATABASE_URL + S3_*

# 2. this repo
cp .env.example .env.local   # dev values: localhost instead of localinfra-postgres / localinfra-s3
                             # (S3_ENDPOINT=http://localhost:3900),
                             # NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL = http://localhost:3000
npm install
npm run db:migrate
npm run db:seed              # seeds the fixed category list
npm run db:invite            # bootstrap the first invite code (only needed once, before any user exists)
npm run dev
```

`DOCKER_CONTEXT=desktop-linux` matters: if your active Docker context is `umbrel`, a bare
`docker compose` runs **on the Pi**.

`.env` holds the Pi deploy values (compose reads it) and `.env.local` the local ones. Next.js and
the `npm run db:*` scripts read `.env.local` on top of `.env`, so `.env.local` wins wherever both
define a key — keep `DATABASE_URL`, `S3_*`, `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in it.

Open http://localhost:3000/signup and use the printed invite code to create the first account.
Every account after that can be invited by an existing member from **Settings → Invite someone**.

### Google OAuth

Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to enable "Continue with Google" (authorized
redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`). Email/password works without it.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | from LocalInfra's `new-project.sh my_recipes --no-redis` |
| `POSTGRES_HOST` / `POSTGRES_PORT` | docker | `localinfra-postgres` / `5432` — the entrypoint waits for it |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | yes | photo bucket, from `new-project.sh --s3` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | that bucket's key (read/write on it only) |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Base URL of the app (public URL on the Pi) |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL — also a Docker **build** arg, rebuild after changing it |
| `PORT` | no | Host port on the Pi, default `3001` (yarg owns `3000`) |
| `TZ` | no | Server timezone, default `America/Sao_Paulo` — decides "today" for the meal plan |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `OPENROUTER_API_KEY` | no (Phase 1+) | LLM import fallback |
| `OPENROUTER_MODEL` | no | Overrides the default import model |
| `YOUTUBE_API_KEY` | no (Phase 1+) | YouTube description fetch; transcripts need no key |
| `ALEXA_API_TOKEN` | no (Phase 4+) | Shared-secret bearer token for `/api/alexa/*` |

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint` / `typecheck` / `test`
- `npm run db:generate` / `db:migrate` / `db:studio` / `db:seed` / `db:invite`
- `npm run photos:upload -- <folder> [--dry-run]` — copy photos from a folder into the bucket
- `./deploy.sh` — build and restart on the Pi (see `DEPLOY.md`)

## Deployment

Runs on the Raspberry Pi (umbrelOS) next to yarg-aggregator, on LocalInfra's shared Postgres and
S3 (Garage), deployed from the Mac through the `umbrel` Docker context. Full guide: **`DEPLOY.md`**.

```bash
./deploy.sh              # bump version, push, build on the Pi, wait for healthy
./deploy.sh --no-bump    # same, without the version commit
./deploy.sh --rollback   # restart the build that was live before the last deploy
```

The container entrypoint (`docker-entrypoint.sh`) waits for Postgres, runs pending Drizzle
migrations, and re-runs the (idempotent) category seed on every start. Health check:
`GET /api/health`.

## Backup & restore

**Settings → Download backup** (or `GET /api/backup`) streams a `my-recipes-backup-YYYY-MM-DD.tar.gz`
containing `db.dump` (a `pg_dump -Fc` custom-format dump) and every photo in the bucket under
`uploads/`.

**⚠️ Treat every backup archive as a secret.** `db.dump` is a full, unfiltered dump of the
database — it includes the `account` table (password hashes, and OAuth access/refresh tokens for
anyone who signed in with Google) and the `session` table (live session tokens, valid until they
expire, that could be replayed to hijack a signed-in session). Store archives the same way you'd
store a password vault export: not in a shared/public Drive folder, not emailed unencrypted.

**Requires `pg_dump` on the app host with a major version >= the Postgres server's** (17, on
LocalInfra) — an older client refuses to dump and the route returns a 500. The Docker image
installs `postgresql17-client` (`PG_MAJOR` build arg) for exactly this reason; for local dev
outside Docker, make sure whatever `pg_dump` is on your `PATH` is v17+.

**Unattended backups don't use this route** (it needs a logged-in session). On the Pi, LocalInfra
dumps the `my_recipes` database to the external drive every night; the photos live in the
`my-recipes` bucket on the same RAID 1 drive and aren't backed up separately (see `DEPLOY.md`).

To restore:

```bash
tar xzf my-recipes-backup-2026-01-01.tar.gz
pg_restore -h <host> -U <user> -d <target-db> db.dump   # target db must already exist and be empty
npm run photos:upload -- uploads                         # copy the photos back into the bucket
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
