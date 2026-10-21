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
| `DATABASE_URL` | yes | written by LocalInfra's `provision-app.sh my_recipes . --no-redis --s3` |
| `POSTGRES_HOST` / `POSTGRES_PORT` | docker | `localinfra-postgres` / `5432` — the entrypoint waits for it |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` | yes | photo bucket, written by `provision-app.sh ... --s3` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | yes | that bucket's key (read/write on it only) |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Base URL of the app (public URL on the Pi) |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL — also a Docker **build** arg, rebuild after changing it |
| `PORT` | no | Host port on the Pi, default `3001` (yarg owns `3000`) |
| `TZ` | no | Server timezone, default `America/Sao_Paulo` — decides "today" for the meal plan |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `LLM_BASE_URL` / `LLM_API_KEY` | no (Phase 1+) | LLM import fallback, through LocalInfra's LLM gateway (`provision-app.sh ... --llm`) |
| `YOUTUBE_API_KEY` | no (Phase 1+) | YouTube description fetch and playlist listing (playlist import needs it); transcripts need no key |
| `ALEXA_API_TOKEN` | no (Phase 4+) | Shared-secret bearer token for `/api/alexa/*` |
| `ALEXA_SKILL_ID` | no | The Alexa skill's id; `/api/alexa/skill` refuses requests without it (see "Alexa skill") |

## Scripts

- `npm run dev` / `build` / `start`
- `npm run lint` / `typecheck` / `test`
- `npm run db:generate` / `db:migrate` / `db:studio` / `db:seed` / `db:invite`
- `npm run photos:upload -- <folder> [--dry-run]` — copy photos from a folder into the bucket
- `./deploy.sh` — build and restart on the Pi (see `DEPLOY.md`)

## Deployment

Runs on the Raspberry Pi (umbrelOS) next to yarg-aggregator, on LocalInfra's shared Postgres and
S3 (Garage), deployed from the Mac through the `umbrel` Docker context, following LocalInfra's
standard app deploy (`../LocalInfra/DEPLOYING-APPS.md`). Specifics: **`DEPLOY.md`**.

```bash
./deploy.sh              # build on the Pi, restart, wait for healthy
./deploy.sh --release    # first bump the version, commit and push
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

## Alexa skill (Echo Show)

"Minhas Receitas", a pt-BR custom skill (SPEC §9.2). The skill's endpoint is this app,
`POST /api/alexa/skill`, through the Cloudflare tunnel; no Lambda. The interaction model and the
manifest are in `skill-package/`.

- "Alexa, pede para minhas receitas preparar cheesecake" (or "Alexa, abre minhas receitas", then
  "preparar cheesecake") searches recipe titles by similarity. One match starts it; several are
  listed on screen to pick by voice ("a segunda") or touch.
- The ingredients come first, on screen. "O que posso usar no lugar de cream cheese?" (or a touch
  on the ingredient) asks for substitutes: the recipe's own "ou" option, else the free LLM tier.
  The web has the same thing as the ⇄ button on each ingredient, for signed-in members.
- Then step by step: "Alexa, próximo", "voltar", "repetir", "quanto vai de açúcar?". "Marcar timer"
  starts a device timer from the step's `durationMinutes`, or "marcar timer de 10 minutos". Timers
  are only created when asked.
- The skill and web cook mode share `KitchenState`, so both are on the same step, and "Alexa, abre
  minhas receitas" resumes where you left off.

Setup (once, with the Amazon account the Echo is on):

1. In the [Alexa developer console](https://developer.amazon.com/alexa/console/ask), create a skill:
   name "Minhas Receitas", locale Portuguese (BR), Custom model, "Provision your own" hosting.
2. Interaction model → JSON editor: paste `skill-package/interactionModels/custom/pt-BR.json`,
   then Build. Interfaces: turn on "Alexa Presentation Language". Permissions: turn on "Timers".
3. Endpoint: HTTPS, `https://<public URL>/api/alexa/skill`, certificate "My development endpoint
   has a certificate from a trusted certificate authority".
   `skill-package/skill.json` is the same setup as a manifest, for the ASK CLI (replace
   `SEU-DOMINIO` with the public host first).
4. Copy the skill id into `ALEXA_SKILL_ID` in `.env` and redeploy (`./deploy.sh`).
5. Test tab: set "Skill testing is enabled in" to Development. The skill then works on every device
   on that account; nothing is published.
6. In the Alexa app, open the skill (Mais → Skills e jogos → Suas skills → Desenvolvedor) and
   allow Timers, or say "marcar timer" once and accept when the Echo asks.

Locally, `ALEXA_SKIP_VERIFICATION=1 npm run dev` accepts unsigned request envelopes, for curl. In
production every request must carry Amazon's signature.

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
