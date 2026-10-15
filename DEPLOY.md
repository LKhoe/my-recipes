# Deployment

my-recipes follows LocalInfra's standard app deploy, [DEPLOYING-APPS.md](../LocalInfra/DEPLOYING-APPS.md)
(same steps, same `deploy.sh` as every app). This page has the my-recipes specifics.

My Recipes runs on the Raspberry Pi 4 (umbrelOS 2), next to yarg-aggregator. It is deployed
**from the Mac** through a Docker context named `umbrel`: `docker compose` runs on the Mac, but
the image is built and the container runs on the Pi. Nothing is cloned on the Pi.

```
┌──────────── this repo ───────────────┐     ┌──────────── LocalInfra ──────────────────┐
│  my-recipes (Next.js)  :3000         │     │                                          │
│      ├── localinfra_postgres ────────┼────►│  localinfra-postgres  db/role my_recipes│
│      ├── localinfra_s3 ──────────────┼────►│  localinfra-s3 (Garage) bucket my-recipes│
│      └── localinfra_tunnel           │     │  localinfra-backup → external drive      │
└──────────│───────────────────────────┘     └──────────────────────────────────────────┘
           ▼
  localinfra-tunnel (Cloudflare) → http://my-recipes:3000
  LAN: http://umbrel.local:3001
```

- **Postgres** and **photo storage** (S3, on Garage) come from [LocalInfra](../LocalInfra) (start
  it first). This app has no Redis and no volumes.
- **Photos** are objects in the private `my-recipes` bucket, on the RAID 1 drive. The bucket is
  never exposed: `/api/uploads/...` streams them to signed-in users only.
- **Public access** goes through LocalInfra's Cloudflare tunnel (`localinfra-tunnel`) on `localinfra_tunnel`.
- **Migrations** run on every container start (`docker-entrypoint.sh`: wait for Postgres →
  `scripts/migrate.mjs` → `scripts/seed.mjs` → start Next.js).

## Prerequisites (on the Mac)

- Docker CLI and the `umbrel` context with SSH key login to the Pi (LocalInfra README, section 1).
- LocalInfra running on the Pi: `DOCKER_CONTEXT=umbrel docker ps --filter name=localinfra`
  shows `localinfra-postgres` as healthy.

## First deploy

```bash
# 1. database + role + photo bucket/key on LocalInfra (no Redis), written straight into .env
#    (local-dev values in .env? move them to .env.local first)
DOCKER_CONTEXT=umbrel ../LocalInfra/scripts/provision-app.sh my_recipes . --no-redis --s3

# 2. fill in what the script lists as still local/placeholder: PORT=3001,
#    BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL (public URL), BETTER_AUTH_SECRET, Google,
#    OpenRouter, ALEXA_API_TOKEN (see .env.example)

# 3. optional: move existing data in — BEFORE the first start (see below)

# 4. build on the Pi and start (3–5 minutes)
./deploy.sh

# 5. first invite code, if the database is new
DOCKER_CONTEXT=umbrel docker exec my-recipes node scripts/create-invite.mjs
```

Then, in the Cloudflare tunnel (Zero Trust → Networks → Tunnels), point the public hostname at `http://my-recipes:3000`, and add
`<public URL>/api/auth/callback/google` to the Google OAuth client's redirect URIs.

### Moving existing data in

Restore the database **before** the app first starts on it (otherwise the migrations create
empty tables first and the restore conflicts):

```bash
# dump from wherever it lives today (example: the old my-recipes-postgres on Docker Desktop)
DOCKER_CONTEXT=desktop-linux docker exec my-recipes-postgres pg_dump -U postgres -Fc my_recipes > my_recipes.dump
# restore as the project's role (it becomes owner of everything)
DOCKER_CONTEXT=umbrel docker exec -i localinfra-postgres pg_restore -U my_recipes -d my_recipes --no-owner --no-acl < my_recipes.dump
```

Photos go into the bucket with `scripts/upload-photos-to-s3.mjs`, from the Mac through an SSH
tunnel to the Pi's S3 port (it's only published on the Pi's loopback). Object keys are the
files' paths under the folder, which is what the database already stores, and old 400px
thumbnails are re-rendered at 800px on the way. Safe to re-run; local files are untouched.

```bash
ssh -N -L 13900:127.0.0.1:3900 umbrel@umbrel.local &                 # tunnel to the Pi's S3 API
S3_ENDPOINT=http://localhost:13900 S3_BUCKET=my-recipes \
S3_ACCESS_KEY_ID=<from .env> S3_SECRET_ACCESS_KEY=<from .env> \
  node scripts/upload-photos-to-s3.mjs uploads --dry-run              # then again without --dry-run
```

From a **Settings → Baixar backup** archive: `pg_restore` its `db.dump` as above and run the
same script on its `uploads/` folder.

## Configuration (`.env`)

Compose reads `.env` **on the Mac**; it is git-ignored. Local dev values go in `.env.local`
instead (README, "Local development"). Every key is in `.env.example` and the README table.

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | from `new-project.sh`: `postgresql://my_recipes:<pw>@localinfra-postgres:5432/my_recipes` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | from `new-project.sh --s3`: `http://localinfra-s3:3900`, `garage`, `my-recipes` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from `new-project.sh --s3`; the key can only read/write `my-recipes` |
| `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` | the public URL. `NEXT_PUBLIC_APP_URL` is baked in at **build** time |
| `PORT` | host port on the Pi, default `3001` (yarg owns `3000`) |
| `TZ` | default `America/Sao_Paulo`; decides "today" for the meal plan |

## Redeploy after changes

```bash
./deploy.sh              # build the working tree on the Pi, restart, wait for healthy
./deploy.sh --release    # first bump the patch version, commit and push
./deploy.sh --rollback   # restart the image that was live before the last deploy
```

`deploy.sh` is LocalInfra's shared one (`templates/app/deploy.sh`); it keeps the outgoing image
as `my-recipes:previous` for `--rollback`. Only this container is rebuilt; LocalInfra keeps
running. Set `DEPLOY_CONTEXT=...` to target another Docker context.

## Common commands

```bash
DOCKER_CONTEXT=umbrel docker compose ps                         # STATUS should say (healthy)
DOCKER_CONTEXT=umbrel docker compose logs -f my-recipes
DOCKER_CONTEXT=umbrel docker compose restart my-recipes
DOCKER_CONTEXT=umbrel docker compose exec my-recipes sh
curl -s http://umbrel.local:3001/api/health                     # {"status":"ok"} = database + bucket reachable
```

Password-reset links are only logged (no email provider): find them with
`DOCKER_CONTEXT=umbrel docker logs my-recipes 2>&1 | grep "Password reset"`.

### Database

```bash
DOCKER_CONTEXT=umbrel docker exec -it localinfra-postgres psql -U postgres -d my_recipes
DOCKER_CONTEXT=umbrel docker exec localinfra-postgres pg_dump -U postgres -Fc my_recipes > my_recipes.dump
```

## Backups

- **Database**: LocalInfra dumps `my_recipes` to the external drive every night (LocalInfra
  README, section 5). Nothing to do here.
- **Photos**: stored by Garage on the external RAID 1 drive, with no separate backup (a
  deliberate choice: RAID 1 covers a dead disk, not deletions or losing the Pi). **Settings →
  Baixar backup** bundles the database and every photo in the bucket when you want a copy.

## Troubleshooting

- **`Database connection failed after 30 attempts`**: LocalInfra isn't running, or the container
  isn't on `localinfra_postgres`.
- **`password authentication failed for user "my_recipes"`**: `DATABASE_URL` doesn't match the
  role; issue new credentials with `provision-app.sh my_recipes . --no-redis --s3 --rotate`.
- **`Bind for 0.0.0.0:3001 failed: port is already allocated`**: pick another `PORT` in `.env`.
- **Backup download fails with `server version mismatch`**: the image's `pg_dump` is older than
  the server; build with `PG_MAJOR` matching LocalInfra's `PG_VERSION`.
- **Sign-in redirects to the wrong host**: `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` must be the
  public URL; rebuild after changing `NEXT_PUBLIC_APP_URL`.
- **Health check fails / photos 404 after a deploy**: the S3 credentials in `.env` don't match
  the key (`docker exec localinfra-s3 garage key list`), or the container isn't on
  `localinfra_s3`. Issue new ones with `provision-app.sh my_recipes . --no-postgres --no-redis --s3 --rotate`.
- **Out of memory on big photo uploads**: the container is limited to 768 MB
  (`deploy.resources.limits.memory`).
