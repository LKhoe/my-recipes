# Decisions

Choices made where SPEC.md was silent, with rationale. Newest last.

## Phase 0

- **Reference project.** SPEC §1 says the architecture mirrors `yarg-aggregator`. That project
  lives locally at `~/Codes/Leo/music/yarg-aggregator` — used it directly as the concrete
  reference for directory layout, the Drizzle connection-caching pattern, the Docker multi-stage
  build, and the `docker-entrypoint.sh` migration-on-boot pattern, adapted where this project's
  stack differs (no Redis/BullMQ, no i18n).

- **Type pairing (§2a).** Fraunces (display, for titles/headings) + Inter (body). Fraunces has the
  warm, slightly-soft editorial character the spec asks for (NYT Cooking-adjacent) while staying
  on Google Fonts/`next/font` with no licensing friction.

- **Color palette (§2a).** Warm terracotta primary, muted sage secondary, warm gold accent, cream
  background — all in OKLCH, defined as CSS custom properties in `app/globals.css` per the
  shadcn/Tailwind 4 `@theme inline` convention. Included a `.dark` variant since it's low-cost and
  standard practice, even though the spec doesn't require dark mode.

- **Invite-code gate mechanism (§3).** Both sign-up paths funnel through one mechanism: the client
  calls `POST /api/invite` with the code *before* either submitting the email/password form or
  redirecting to Google OAuth. That endpoint pre-validates the code and sets a short-lived (10 min),
  httpOnly `pending_invite_code` cookie. `lib/auth.ts`'s `databaseHooks.user.create.before` hook is
  the actual gate — it re-validates the code from that cookie and throws `APIError` to abort
  creation if missing/invalid; `after` marks the code used. A cookie (not a body field) is required
  because the Google OAuth callback is a browser redirect with no custom JSON body under our
  control, so it's the only channel common to both sign-up paths. Verified against the compiled
  `better-auth`/`better-call` source: hooks receive the real request's `context.headers`
  (`request.headers` is attached unconditionally by the router), so cookie parsing there is
  reliable, and a thrown `APIError` from `before` correctly aborts the create and surfaces to the
  client as a 400.

- **`InviteCode.createdByUserId` is nullable.** SPEC §5 doesn't say NOT NULL, and the first invite
  code has no member to have created it (chicken-and-egg before any user exists). Bootstrap it via
  `npx tsx lib/db/create-invite.ts`; every invite minted through the app
  (`POST /api/invite/generate`, authenticated) sets a real creator.

- **Password reset email delivery.** SPEC §2 doesn't list a transactional email provider anywhere
  in the stack. `sendResetPassword` logs the reset link to the server console rather than emailing
  it — acceptable for a private few-user household app where an admin can relay the link manually.
  Revisit with real SMTP if that becomes annoying.

- **Category seed list (§4.2).** Fixed 12: Breakfast, Brunch, Appetizer, Main, Side, Salad, Soup,
  Dessert, Snack, Bread, Sauce & Condiment, Beverage. The spec only gave three examples.

- **Postgres version:** 16-alpine (unpinned in spec). Phase 4's `postgresql-client` in the app
  image must match this major version for `pg_dump`/`pg_restore` (§4.9, §7).

- **`middleware.ts` → `proxy.ts`.** This Next.js version (16.2) deprecated the `middleware.ts`
  convention in favor of `proxy.ts` (same export shape, renamed). Followed the new convention —
  `yarg-aggregator` has already migrated to it too.

- **`package.json` has `"type": "module"`.** Needed for `tsx` to run the seed/CLI scripts (which
  import `lib/db/index.ts`, itself using top-level `await`) without a CJS transform error. The
  whole codebase is ESM already; no downside.

- **`Rating` and `Note` are one-per-(user, recipe).** SPEC §4.7 describes "a rating" and "private
  notes" per user per recipe (singular), not a list, so both tables have a
  `unique(userId, recipeId)` constraint — upsert semantics rather than append-only.

- **`ShoppingListItem.ingredientId` is nullable, plus a `customName` column.** §9.1 mentions adding
  a shopping-list item by voice ("add item to shopping list"), which may not resolve to a canonical
  `Ingredient` at the time of insert. Manually-typed free-form items use `customName` instead.

- **`KitchenState` singleton.** Modeled as a single row with a fixed, well-known primary key
  (`"singleton"`) rather than a DB-level one-row constraint (Postgres has no clean native way to
  express that short of a partial unique index trick that isn't worth the complexity here).
  Enforced by always upserting that fixed id at the service layer — a rule for Phase 2/3 code to
  respect, not something the schema itself can guarantee.

## Phase 1

- **OpenRouter model default.** `google/gemini-3.1-flash-lite-20260507` — checked OpenRouter's
  current catalog rather than guessing; it's the cheapest capable structured-JSON model available
  at the time of writing ($0.25/$1.50 per M tokens). Overridable via `OPENROUTER_MODEL` without a
  code change, since model catalogs shift.

- **`max_tokens: 4096` on every OpenRouter call.** Discovered the hard way during real-call
  testing: with no cap, some models default to a huge `max_tokens` (65536) that a modest-credit
  OpenRouter account can't afford, producing a 402 before any extraction happens. 4096 is
  comfortably enough for a recipe's JSON and keeps cost predictable.

- **JSON-LD ingredient/duration parsing is a deterministic regex parser, not the LLM
  (`lib/services/ingredient-parser.ts`, `lib/services/duration.ts`).** SPEC §4.6 step 1 promises
  the JSON-LD path is free and instant — routing its ingredient-line splitting through the LLM
  would quietly break that promise. The parser is necessarily imperfect on unusual phrasing;
  that's an accepted tradeoff for the no-LLM-call guarantee. The `inferred` flag is therefore
  always `false` on this path (nothing is being estimated, just parsed-or-left-null) — estimation
  is genuinely an LLM behavior, reserved for the two LLM paths (4.6 step 2, 4.6b).

- **Import images are fetched server-side, not left as remote URLs.** SPEC §4.8 rules out external
  object storage, so a draft's `imageUrl` (from JSON-LD `image` or a YouTube thumbnail) can't be
  stored as-is on the recipe. `POST /api/recipes/[id]/images` accepts either a multipart upload or
  a JSON `{ imageUrl }` body; the latter fetches server-side and runs it through the same
  sharp/webp pipeline. This is what makes "import takes under a minute" true without a manual
  photo step — verified end-to-end against a real YouTube video.

- **Rate limiting is in-memory, per SPEC §8's no-Redis constraint** (`lib/rate-limit.ts`) — a
  sliding window keyed by user id, 10 imports/hour. Doesn't survive a restart or scale across
  instances, which is fine for a single self-hosted process; revisit if that ever changes.

- **`Rating`/`Note`-style one-per-user tables aside, `RecipeCategory`/`RecipeTag` are replaced
  wholesale on every save** (`replaceRecipeAssociations` in `lib/services/recipe.ts`) rather than
  diffed — delete-then-reinsert inside the same transaction. Simpler and correct for a form-driven
  edit UI where the client always sends the full desired state; not appropriate for a
  high-concurrency multi-writer table, which this isn't.

- **Vitest added as the test runner.** SPEC doesn't name one. Chosen over Jest for native ESM/TS
  support with no babel/ts-jest configuration — this project has no legacy CJS test suite to stay
  compatible with.

- **Real-call verification, not just mocks.** Beyond the mocked unit tests, ran the JSON-LD path
  against a live site (bbcgoodfood.com), the LLM fallback against a local fixture (real OpenRouter
  call — this is what surfaced the `max_tokens` bug above), and the full YouTube pipeline against
  two real videos supplied by the user: one Portuguese-language recipe (description path,
  confirmed "a gosto" ↔ "to taste" handling and a missing-servings page both surface as `null`
  rather than a guess) and one non-recipe video (confirmed the description→transcript→manual-entry
  fallback chain completes cleanly with title/videoUrl/thumbnail prefilled, per §4.6b step 3).

## Phase 2

- **Fraction-friendly vs. practical-rounding units (§4.3) are a fixed classification, not
  per-recipe.** `lib/scale.ts` treats `cup`/`tbsp`/`tsp`/`clove`/`slice`/`piece`/`pinch`/`dash`/
  `bunch`/`sprig`/`stick` and no-unit (bare counts like eggs) as fraction-friendly (nearest eighth,
  rendered as a unicode fraction); everything else (`g`, `kg`, `ml`, `l`, `oz`, `lb`, …) rounds to
  practical precision (whole numbers above 10, one decimal below). Matches the spec's own examples
  ("1⅓ eggs", "267 g") exactly; the line has to be drawn somewhere and this follows normal
  culinary convention.

- **`lib/youtube-utils.ts` split out from `lib/services/youtube.ts`.** The service file imports
  `youtubei.js` (Innertube) at module scope for transcript fetching — a heavy, server-only
  dependency. The video-embed component and the import pipeline both need pure URL parsing
  (`parseYouTubeVideoId`/`isYouTubeUrl`); pulling that out into a dependency-free module keeps
  `youtubei.js` out of the client bundle. `lib/services/youtube.ts` re-exports the same two
  functions so server code didn't need to change its imports.

- **Video takes priority over the hero photo on the detail page.** If a recipe has a `videoUrl`,
  the embed replaces the photo slot rather than sitting beside it — SPEC §4.1 doesn't say which
  wins when both exist, and showing both stacked felt redundant/heavy for something that's meant
  to load light-weight (lite-embed pattern) at the top of the page.

- **Cook Mode is a full-viewport client overlay (`fixed inset-0 z-50`), not a separate layout
  branch.** It still lives under the `(app)` route group (so it shares session-fetching
  conventions with the rest of `/recipes/*`) but visually covers the header behind it rather than
  restructuring routing to opt out of the parent layout — simpler than fighting App Router's
  layout nesting for one screen that wants to be chrome-free.

- **Step timers are per-step local state, not global.** Each step with a `durationMinutes` gets
  its own independent start/pause/reset countdown that keeps running even if you navigate to
  another step and back (component stays mounted; only the *visible* step's timer UI is shown at
  a time, matching "inline… for the current step" in §4.1a) — but the countdowns themselves are
  local to the browser tab, not persisted or synced, since the spec scopes timers as "device-native
  timers remain the Alexa skill's job" for anything beyond an on-screen countdown.

- **KitchenState step-sync writes are guarded by a `WHERE activeRecipeId = recipeId` condition**
  (`updateKitchenStep` in `lib/services/kitchen.ts`), not just a client-side `isActiveInKitchen`
  check — verified this matters: a stale Cook Mode tab left open on a recipe that's no longer the
  active one gets `{applied: false}` and cannot clobber whichever recipe the circle is actually
  cooking now.

## Phase 3

- **Shopping-list merge drops ingredient notes.** SPEC §5's `ShoppingListItem` has no `note`
  column (unlike `RecipeIngredient`) — prep detail ("chopped", "melted") isn't relevant to buying
  groceries, so `lib/shopping-list-merge.ts` only carries ingredient/quantity/unit through. Merge
  key is `(ingredientId, unit)`; a bare count (no unit) is its own bucket, distinct from any real
  unit — verified against real recipes that "2 eggs" and "100g eggs" correctly stay as two lines,
  not merged.

- **All-unquantified duplicates ("salt, to taste" in every recipe) collapse to one line with a
  null quantity**, rather than being dropped or listed once per recipe. If a bucket has *some*
  quantified items and some unquantified ones, the unquantified ones just don't add to the sum —
  there's nothing numeric to add. Verified against real data (two recipes both saying "salt, to
  taste" produced exactly one "salt" line, no quantity).

- **Shopping lists are per-user, not circle-shared** — this follows SPEC §5's schema directly
  (`ShoppingList.userId`), unlike the circle-shared meal plan. Each "Generate" click always creates
  a **new** `ShoppingList` row rather than merging into an existing one; the shopping-list page
  shows the user's most recent list. Older lists aren't deleted (consistent with the soft-delete/
  recoverable-by-DB philosophy elsewhere) but also aren't browsable in v1 — SPEC doesn't ask for
  list history, and this avoids a list-picker UI for a feature likely used a few times a week.

- **Meal-plan "drag" vs. "assign" split.** SPEC §4.4 says "drag/assign recipes onto calendar
  slots." Read this as two distinct interactions for two distinct actions: clicking "+" opens a
  searchable recipe picker to *add* a recipe to a slot (works on touch, no drag needed); dragging
  an *already-assigned* chip to a different cell *moves* it (native HTML5 drag-and-drop, no added
  dependency). Didn't build a separate draggable recipe-list rail for adding-via-drag — one add
  path (the picker) plus real drag feedback for rearranging covered both spec verbs without a
  second, redundant UI surface.

- **Backup: `pg_dump`'s stdout is buffered in memory (once), uploaded files stream from disk
  without buffering.** Tar entries require a known size up front; a live process's stdout doesn't
  have one without either buffering it or running the dump twice. Each upload file's size comes
  free from `stat()`, so those genuinely stream via `tar-stream`'s writable entry + a piped
  `fs.createReadStream` — no buffering there. Acceptable at this app's data scale (a personal
  recipe collection, not a data warehouse); revisit if dumps ever grow large enough for this to
  matter.

- **Bug found via real-call testing: `pack.pipe(gzip)` didn't forward `pack`'s `error` event**,
  so a failed `pg_dump` (first tested this against a local `pg_dump` 14 client against the
  Postgres 16 server — a genuine version mismatch, not a code bug) crashed the whole dev server
  with an uncaught exception instead of returning a clean 500. Fixed with an explicit
  `pack.on("error", err => gzip.destroy(err))` — Node streams don't propagate `error` across
  `.pipe()` by design. Verified both failure (clean 500, server survives) and success (real
  restore into a scratch Postgres database, row counts matched) paths.

- **`@types/node` bumped from `^20` to `^24`** to match the `engines.node >= 24` already declared
  — `^20`'s bundled types didn't recognize some Node 22+/24 stream APIs reached for during this
  phase.
