# CLAUDE.md

Guidance for Claude Code in this repository. Product spec: `SPEC.md`; choices where the spec was
silent: `DECISIONS.md` (newest last); Pi deployment: `DEPLOY.md`; overview: `README.md`.

## Commands

```bash
npm run dev                # http://localhost:3000 (host port on the Pi is 3001, loopback only)
npm run typecheck && npm run lint && npm test
npm run db:generate        # after editing lib/db/schema.ts — commit the migration
npm run db:check           # fails if schema.ts has changes without a migration (also runs in the Docker build)
npm run db:migrate         # applies migrations using .env.local
npm run db:seed            # fixed category list
npm run scripts:bundle     # esbuild bundles of the in-container scripts (Dockerfile runs it)
npm run db:invite          # first invite code (only before any user exists)
npm run photos:upload      # push local photos to the S3 bucket
./deploy.sh                # deploy to the Pi (Docker context "umbrel")
```

Local Postgres and S3 are local-infra on Docker Desktop (`../local-infra`). Always pass
`DOCKER_CONTEXT` explicitly (`desktop-linux` = Docker Desktop, `umbrel` = the Pi).

## Architecture

- Next.js App Router + Drizzle + Better Auth. No Redis, no volumes, no i18n.
- `app/(app)/`, `app/(auth)/` — pages; `app/api/` — `recipes`, `import-batches`, `meal-plan`,
  `shopping-list`, `playlists`, `kitchen`, `youtube`, `uploads`, `invite`, `backup`, `alexa`, `health`.
- `lib/services/` — domain logic per area (recipe import/parsing, ingredients, shopping list,
  substitutions, storage/images, LLM, backup, Alexa auth). Pure parsers have `*.test.ts` beside them.
- `lib/alexa/` — Alexa skill (`skill.ts`, `speech.ts`, `apl.ts`, `timers.ts`, `verify.ts`);
  interaction models in `skill-package/`.
- `lib/auth.ts` — sign-up is invite-only: `POST /api/invite` sets a short-lived
  `pending_invite_code` cookie and the `user.create.before` hook is the real gate (see DECISIONS.md).
- Photos live in the private S3 bucket `my-recipes`; `/api/uploads/...` streams them. Recipe photos
  are public, cook photos need a signed-in user. The bucket is never exposed.
- LLM calls go through local-infra's gateway (`lib/services/llm.ts`, tiers in `lib/llm-tiers.ts`),
  never straight to a provider; handle `429`.
- Container start runs `docker-entrypoint.sh`: wait for Postgres → migrate → seed → start.

## Gotchas

- `.env` = Pi values, `.env.local` = local dev (wins). Keep `DATABASE_URL`, `S3_*`,
  `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` in `.env.local`. Don't print or commit either.
- S3 is Garage: path-style requests, region `garage`.
- DB/role name is `my_recipes` (underscore); container, image and bucket are `my-recipes`.
- The runtime image has no `npm ci`: Next's standalone output carries the server's dependencies
  (Turbopack bundles most of them), `node_modules/@img` is copied from the builder for sharp's
  libvips (the standalone trace misses the dlopen'd `.so`), and `scripts/migrate.mjs`, `seed.mjs`
  and `create-invite.mjs` are esbuild bundles (`npm run scripts:bundle`, output `dist-scripts/`,
  copied to `/app/scripts`). A new script that runs inside the container must be added to
  `scripts/bundle.mjs`; a new dependency needs no Dockerfile change unless it has a native
  binary that tracing misses (then check `require()` in the built image). Never a bare
  `npm install <pkg>` in the Dockerfile.
- The container runs read-only (`docker-compose.yml`): writable paths are only the tmpfs mounts
  `/tmp` and `/app/.next/cache`. Anything new that writes to disk at runtime has to use them
  (or S3).
