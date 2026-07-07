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

## pt-BR translation

User request: translate the app to Brazilian Portuguese — pages in pt-BR, code stays in English
(identifiers, comments, commit messages unaffected; only user-facing strings translated).

- **Scope of "user-facing."** Interpreted broadly: every string a user actually reads —
  page/component copy, `aria-label`/`alt`/`title` attributes, toast messages, and **API route
  error strings**. The last one is easy to miss but matters: client code throughout the app does
  `body?.error ?? "<pt-BR fallback>"`, so an API route returning an English `error` field would
  silently override the Portuguese fallback and leak English text into the UI. Translated all of
  them (`app/api/**/route.ts`) for this reason, not just the component-level strings.

- **Category rows renamed in place, not re-seeded.** `lib/db/seed.ts`'s fixed list (SPEC §4.2)
  now seeds Portuguese names for fresh installs, but the existing dev database already had English
  rows with real recipe associations (`recipe_category` join rows keyed by `categoryId`, an
  immutable id). Wrote a one-off script (`_translate-categories.ts`, deleted after running) that
  `UPDATE`s `category.name` by matching the old English name — preserves ids/associations, so nothing
  needed to be re-linked. Re-seeding would have created new rows with new ids, orphaning any
  existing category assignments.

- **Ingredient-parser unit vocabulary is bilingual (Portuguese + English), not Portuguese-only.**
  Initially translated `UNIT_ALIASES` (`lib/services/ingredient-parser.ts`) to Portuguese-only,
  but this parser is the JSON-LD import path (SPEC §4.6 step 1) — it parses `recipeIngredient`
  text scraped verbatim from arbitrary third-party sites, many of which are English-language
  (e.g. "2 tbsp olive oil"). A Portuguese-only vocabulary would silently misparse the unit as part
  of the ingredient name for every such site. Asked the user directly on this one since it's a
  real product tradeoff, not a copy question; confirmed bilingual support (both vocabularies
  normalize to the same canonical pt-BR token — "tbsp" and "colher de sopa" both → "csp") is
  wanted, so import quality doesn't regress for non-Portuguese sources while everything the user
  actually reads or types stays pt-BR. The LLM extraction paths (4.6 step 2, 4.6b) don't need this
  same treatment — the prompt already instructs the model to normalize to the pt-BR token set
  regardless of the source language, since an LLM translates rather than pattern-matches.

- **Canonical unit tokens changed to Portuguese abbreviations**: `cup`→`xíc`, `tbsp`→`csp`,
  `tsp`→`cch`, `clove`→`dente`, `slice`→`fatia`, `piece`→`unidade`, `pinch`→`pitada`,
  `dash`→`borrifo`, `bunch`→`maço`, `sprig`→`ramo`, `stick`→`tablete`, `package`/`pkg`→`pacote`.
  These are the tokens stored in `RecipeIngredient.unit` / `ShoppingListItem.unit` and used for
  shopping-list merge-key matching (`lib/shopping-list-merge.ts`) — changing them is safe for new
  data since the merge only cares that two rows' unit strings are equal, not what they say.

- **Decimal separator: comma, not period** (`formatScaledQuantity` in `lib/scale.ts`, via
  `toLocaleString("pt-BR")`) — "2,5" not "2.5", per pt-BR convention. Only affects *display*
  formatting; quantities are still stored as plain decimal numbers in Postgres.

- **`<html lang="pt-BR">`** set in the root layout — matters for screen readers and browser
  spell-check/translate-prompt heuristics, not just SEO.

## Phase 4

- **Migration/seed scripts duplicated as plain `.mjs` for the Docker image** (`scripts/migrate.mjs`,
  `scripts/seed.mjs`), separate from the `tsx`/drizzle-kit-based `lib/db/seed.ts` used in dev.
  Mirrors `yarg-aggregator`'s pattern exactly: the production image's runtime stage doesn't ship
  `tsx` or `drizzle-kit` (dev dependencies), so migrations/seeding at container startup need
  scripts that run under plain `node`. The category list is duplicated between the two seed
  scripts with a "keep in sync" comment rather than shared across the TS/JS boundary — trying to
  make a `.ts` file importable from a no-build-step `.mjs` runtime script felt like more fragility
  than a 12-item array duplicated once was worth.

- **`gen_random_uuid()` used directly in `scripts/seed.mjs`'s raw SQL** rather than generating
  UUIDs in JS — confirmed it's built into Postgres core since v13 (no `pgcrypto` extension
  needed), so this works out of the box against the `postgres:16-alpine` image with zero setup.

- **Alexa API surface auth is a single shared-secret bearer token (`ALEXA_API_TOKEN`), not
  per-device.** SPEC §9.1 says the surface is "token-authenticated" but the per-device PIN-pairing
  mechanism (`AlexaDevice` table) is explicitly scoped to §9.2 as future work, not shipped in v1.
  Since there's no device identity to check yet, one shared secret compared against the
  `Authorization: Bearer` header is the simplest thing that satisfies "token-authenticated"
  without inventing schema for a skill that isn't being built this phase. Every circle member's
  Echo would present the same token — acceptable for a private single-household app; revisit if
  the future skill build needs per-device semantics.

- **`POST /api/alexa/shopping-list` targets the most-recently-created shopping list across the
  whole circle, not a specific user's.** SPEC §5's `ShoppingList` table is per-user
  (`ShoppingList.userId`), but the Alexa surface has no logged-in user — voice requests aren't
  authenticated as any particular circle member, just as "the household's Echo." Rather than add
  new schema (e.g. a circle-wide list) to serve a hook for a skill that isn't being built yet,
  `getMostRecentShoppingListAcrossCircle()` picks whichever list (any user's) was generated last,
  on the assumption that's the one actually in use. If the future skill needs per-user shopping
  lists, that's the point to revisit this.

- **`advanceKitchenStep` (next/previous/jump) operates on "whatever recipe is active," not a
  caller-supplied recipe id** — unlike the web Cook Mode's `updateKitchenStep`, which always knows
  its own recipe id and guards against writing to a no-longer-active one. The Alexa skill (when
  built) has no independent notion of "which recipe" beyond what `/api/alexa/active-recipe`
  already told it, so there's nothing to guard against — it's inherently always operating on the
  active recipe. Index is clamped to the active recipe's actual step count either way.

- **Dockerfile installs `postgresql16-client`** (Alpine package name, confirmed available via
  `apk search` against `node:24-alpine`'s package index) — matches the `postgres:16-alpine`
  service exactly, required for the backup export route's `pg_dump` (SPEC §4.9/§7).

- **`docker-compose.yml` gained an `uploads_data` named volume** mounted at `/app/uploads` in the
  app container, so recipe photos (SPEC §4.8, local-disk storage) survive container
  rebuilds/redeploys rather than living only in the container's writable layer.

- **`deploy.sh` uses generic `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_PORT` env var names** rather than
  yarg-aggregator's `PI_HOST`/`PI_USER` — this app isn't necessarily deployed to a Raspberry Pi,
  so the more generic names felt like the honest choice for a from-scratch script rather than
  copying naming that was specific to yarg's own deploy target.

## App logo

Requested standalone: a mark for the app, not tied to a spec section. Design: a steaming bowl,
rendered as a handful of soft bezier curves (bowl silhouette + a shaded crescent for depth + an
open-rim ellipse cutout + two tapering steam curls) — simple enough to stay legible at 16px
favicon size, warm/appetizing per §2a's "food should look inviting" without reading as generic
clip-art. Verified by rendering the SVG to PNG at 16/32/48/96px and inspecting each.

- **Colors computed from the actual design tokens, not eyeballed.** Wrote a small standalone
  OKLCH→sRGB conversion script (public-domain CSS Color 4 formulas, no dependency) against the
  exact `--primary`/`--foreground`/`--background` values in `app/globals.css`, so the logo's
  terracotta/cream/gold are the same colors as the rest of the UI, not a close-but-off match:
  primary `#C25237`, background `#FCF8F3`, a darker shade-only tone `#76392A` (unused elsewhere,
  derived the same way, for the bowl's interior shading), and a mid-gold `#CD995C` for the steam
  (the `--accent` token itself, `#EECFA9`, was too pale to read against cream at small sizes).

- **Artwork exists in two places kept manually in sync: `app/icon.svg` (static, Next.js's
  metadata-file favicon convention) and `components/icons/RecipeBowlMark.tsx` (inline React, used
  in the app header and auth screen).** Next's `app/icon.svg` convention needs a real static file
  fetchable at a URL for the `<link rel="icon">` tag; the header/auth usages need an inline
  component (to size/color it in context, and so it isn't a network request). A single source of
  truth would've meant generating one from the other at build time for a two-file, rarely-changed
  asset — not worth the tooling.

- **Fixed a real bug this surfaced: `proxy.ts`'s middleware matcher excluded `favicon.ico` but not
  Next's `icon.svg` route**, so unauthenticated requests for the favicon were being redirected to
  `/login` (serving login HTML instead of the SVG) — caught by actually curling `/icon.svg` as a
  logged-out request rather than assuming the metadata-file convention was automatically exempt.
  Added `icon.svg` to the matcher's negative lookahead alongside `favicon.ico`.

- **The rim cutout is a hardcoded cream ellipse (`#FCF8F3`), not theme-aware.** `globals.css` has
  a `.dark` token set, but nothing in the app currently applies the `.dark` class (no
  `next-themes` provider is wired into `layout.tsx` despite the dependency being installed) — dark
  mode is inert tokens, not a live feature. Hardcoding light-mode cream is correct for the app as
  it actually behaves today; revisit if dark mode is ever wired up for real.

## 2026-07-07 — Unit normalization at the service layer (bug fix)

A code review against the dev DB found `recipe_ingredient.unit` holding, side by side, `csp`,
`colher de sopa`, `colheres (sopa)`, `colheres`, `fatia`, `fatias`, `dente`, `dentes` — the LLM
extraction path and the manual edit form's free-text unit field both wrote straight to the
database with no normalization, even though `lib/services/ingredient-parser.ts` already had a
`UNIT_ALIASES` table (used only by the JSON-LD import path's line parser). This silently broke
shopping-list merging (`lib/shopping-list-merge.ts` keys on exact unit-string equality) and
fraction-friendly scaling (`lib/scale.ts` only recognizes canonical tokens) for anything that
didn't arrive via JSON-LD import.

- **Fix: normalize at the service layer, not per-import-path.** Added `normalizeUnit()` to
  `ingredient-parser.ts` — an exact-match (trim + lowercase) lookup against the same
  `UNIT_ALIASES` table, distinct from `parseLeadingUnit()` (which pulls a unit off the front of a
  whole ingredient *line* via prefix matching). `lib/services/recipe.ts`'s
  `replaceRecipeAssociations` now runs every incoming `item.unit` through it before insert — this
  is the single choke point all three save paths (manual form, LLM extraction, JSON-LD import)
  already go through, so fixing it there fixes all three regardless of what upstream code does or
  doesn't normalize.

- **Unrecognized units are stored as-typed (trimmed/lowercased), not rejected.** SPEC doesn't
  define a closed unit vocabulary; rejecting a real but unusual unit (e.g. "gomos" for orange
  segments) would block saving a real recipe over a cosmetic mismatch. This only guarantees
  *known* variants collapse to one token — it doesn't guarantee every possible unit string is
  canonical, which is an inherent, accepted limit given SPEC's open vocabulary.

- **Added alias entries for the variants actually observed**: `"colheres (sopa)"`,
  `"colher (sopa)"`, and the "chá" parenthesized equivalents, all → `csp`/`cch`. `fatias`/`dentes`
  were already correctly aliased in the table (the bug was that normalization was never *invoked*,
  not that the table was incomplete for those) — new entries only were the parenthesized and bare
  forms.

- **Bare "colher"/"colheres" (no "de sopa"/"de chá" qualifier) defaults to tablespoon (`csp`).**
  Genuinely ambiguous in isolation, but confirmed against the dev DB's real data (3 colheres de
  açúcar in a bolo recipe) that this is the Brazilian convention: unqualified "colher" means
  tablespoon; teaspoon is almost always spelled out as "de chá" explicitly. Flagging this as a
  judgment call rather than a certainty — revisit if a real recipe surfaces where this default is
  wrong.

- **One-off cleanup script** (`_normalize-units.ts`, same throwaway pattern as
  `_translate-categories.ts` from the pt-BR translation work): selected distinct units from both
  `recipe_ingredient` and `shopping_list_item`, ran each through `normalizeUnit()`, and `UPDATE`d
  in place where it changed. Ran against the dev DB (`colher de sopa`→`csp` ×2, `colheres (sopa)`
  →`csp` ×3, `colheres`→`csp` ×1, `fatias`→`fatia` ×2, `dentes`→`dente` ×1;
  `shopping_list_item` had zero rows at the time), re-ran the distinct-units query to confirm only
  canonical tokens remained, then deleted the script.

- **Added a real-DB integration test** (`lib/services/recipe.test.ts`) — the first test in this
  project to touch a live database rather than mocks/fixtures, per the project's own preference
  for verifying against real data. It creates a throwaway user + recipe with dirty units
  (`"colher de sopa"`, `"fatias"`), reads it back via `getRecipeById`, asserts the stored units are
  `csp`/`fatia`, and deletes the throwaway user in `afterAll` (cascades to the recipe/
  recipeIngredient rows via the existing `onDelete: "cascade"` FK). This means `npm test` now
  requires a running, migrated Postgres — consistent with how this project's own docs already
  assume `docker compose up -d postgres` before local dev, so not a new requirement in practice,
  but worth naming since every other test file is DB-free.

## 2026-07-07 — HEIC upload support

A review flagged that `lib/image-constants.ts` advertises `image/heic`/`image/heif` support, but
sharp's prebuilt binaries bundle libheif *without* a licensed HEVC decoder (patent/licensing
reasons) — so a real iPhone photo (H.265/HEVC-encoded, not the royalty-free AV1 codec sharp does
support) was suspected to fail. Confirmed exactly that: generated a real HEVC `.heic` file with
macOS's `sips -s format heic`, ran it through `sharp(buffer)` directly (`heif: Decoder plugin
generated an error: Unspecified (7.0)`), then through the real upload endpoint against both the
dev server and the built Docker image — both 500'd with the generic "Falha ao enviar a imagem."
message, i.e. silently advertised support that broke.

- **Chose to add working decoding, not remove support**, after confirming a viable path exists:
  `heic-convert` (built on `libheif-js`, an Emscripten/WASM build of libheif that — unlike sharp's
  prebuilt binary — does include an HEVC decoder) successfully decoded the same real HEVC fixture
  that sharp rejected. Verified the decoded output pixel-for-pixel matched the known source color
  by rendering it, not just checking that bytes came out. `processAndStoreImage`
  (`lib/services/image.ts`) now pre-converts HEIC/HEIF buffers to JPEG via `heic-convert` before
  handing them to the existing sharp resize/webp pipeline, unchanged for every other format.

- **Why this and not the `ALLOWED_MIME_TYPES` removal the review offered as the fallback option**:
  removing support would have meant deviating from SPEC §4.8's explicit "JPEG/PNG/WebP/HEIC
  input" requirement over a problem that turned out to have a real fix; `heic-convert` is pure
  JS+WASM (confirmed no native bindings, no `.node` files, no postinstall compilation step) with
  zero dependencies of its own, so it drops cleanly into the Alpine-based Docker build without a
  native toolchain — verified by rebuilding the image and uploading the same HEVC fixture through
  the running container.

- **`heic-convert`'s `convert()` (not `.all()`) takes just the primary image** from the HEIC
  container — correct here since a recipe photo upload is always one image; `.all()` exists for
  multi-picture HEIC files (bursts, live photos) which isn't a case this app needs to handle.

- **Added a real-file regression test** (`lib/services/image.test.ts` +
  `fixtures/image/sample.heic`, a genuine ~600-byte HEVC-encoded fixture generated the same way as
  the manual verification, not a renamed JPEG) — the second DB/filesystem-touching integration
  test in this project (after `recipe.test.ts`), on the same reasoning: a mocked test can't catch
  "the codec isn't actually there," only a real file through the real decode path can.

## 2026-07-07 — Smaller hardening items

- **`lib/services/alexa-auth.ts` now compares tokens via `crypto.timingSafeEqual` over SHA-256
  digests of both sides**, not `===`. Hashing first sidesteps `timingSafeEqual`'s requirement that
  both buffers be the same length (a raw token comparison can't guarantee that without leaking a
  length signal via an early-return) and means the digest length reveals nothing about the actual
  token's length either. Verified against the real running server: correct token still gets past
  auth (404 "no active recipe," as expected with no active recipe), wrong token still gets a clean
  401 — the change is invisible to legitimate callers.

- **`lib/auth.ts`'s `databaseHooks.user.create.after` now logs a warning when
  `redeemInviteCode` returns `false`** (the code was already consumed by the time this hook ran —
  a concurrent-signup race, since the `before` hook's `isInviteCodeRedeemable` check and this
  `after` hook's atomic redeem happen in two separate round trips with no lock held between them).
  Reproduced the race for real: fired two truly concurrent sign-up requests sharing one invite
  cookie against the dev server. **Both signups succeeded** (both passed the `before` check before
  either had written `usedAt`), but only one redeem call actually claimed the code — confirmed the
  warning logged for the loser, with its user id and the code, exactly as intended.

  Worth being explicit about what this fix does and doesn't do, since the task scoped it as
  logging-only ("no schema change needed"): it makes the double-use *visible*, it does not prevent
  a second account from being created on one invite code. The `before` hook's check-then-later-
  write pattern is inherently racy without an atomic check-and-claim at that step (e.g. a
  conditional `UPDATE ... WHERE usedAt IS NULL RETURNING` moved earlier, before user creation,
  with a rollback path if it fails) — that would be a real fix but is more invasive than what was
  asked here. Flagging it in case closing this race for real is wanted as follow-up.

- **`kitchen_state` gets a `CHECK (id = 'singleton')` constraint** (migration
  `0001_numerous_ikaris.sql`), on top of the existing primary key. The primary key already blocks
  a *second* row from ever existing; the check constraint additionally guarantees the one row
  that's allowed can only ever be the well-known `SINGLETON_KITCHEN_STATE_ID` — so a bug that
  tried to insert some other id fails loudly at the DB instead of silently creating a stray row
  the app would never read. Verified by actually trying to violate it (`INSERT ... VALUES
  ('not-the-singleton')` → `ERROR: violates check constraint`) and by re-running the real
  send-to-kitchen flow twice through the live server afterward to confirm the legitimate
  `onConflictDoUpdate` upsert path is unaffected.
