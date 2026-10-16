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
  `npx tsx lib/db/create-invite.ts` (since replaced by `npm run db:invite`, see "Deploy on LocalInfra"); every invite minted through the app
  (`POST /api/invite/generate`, authenticated) sets a real creator.

- **Password reset email delivery.** SPEC §2 doesn't list a transactional email provider anywhere
  in the stack. `sendResetPassword` logs the reset link to the server console rather than emailing
  it — acceptable for a private few-user household app where an admin can relay the link manually.
  Revisit with real SMTP if that becomes annoying.

- **Google can link to an unverified email/password account** (`accountLinking.
  requireLocalEmailVerified: false`). With no email provider, local accounts never get
  `emailVerified`, and Better Auth's default (`true`) refused to link Google to them, so a member
  who signed up with a password got `account_not_linked` when trying Google. The default guards
  against pre-account takeover: someone registers a password account with another person's email,
  and that person's later Google login lands in it. Here registering needs an invite code, so the
  attacker would first have to get one from a member; accepted for a closed household circle.
  Revisit if sign-up ever opens up or real email verification arrives.

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

- **Added a test (`lib/db/seed.test.ts`) asserting `lib/db/seed.ts` and `scripts/seed.mjs`'s
  category lists stay in sync**, closing the loop on the "keep in sync" comment left when the
  list was first duplicated (pt-BR translation work). Can't just `import` either file to compare
  arrays — both run their seed immediately on import as a side effect (`seed.ts` even calls
  `process.exit(0)`, which would kill the test runner), so the test instead extracts each file's
  `CATEGORIES` array straight out of its source text via regex + `JSON.parse` (safe here since the
  array is always plain double-quoted strings) rather than executing either module. Verified the
  test isn't a tautology by deliberately breaking sync (renamed one entry in `scripts/seed.mjs`),
  confirming it fails with a clean diff, then reverting.

- **README now documents `db.dump` as sensitive** (it's a full, unfiltered `pg_dump` — confirmed
  by reading `collectPgDump()`: no `--exclude-table`, so `account`'s password hashes/OAuth tokens
  and `session`'s live session tokens are in every backup) **and gives `docker exec
  my-recipes-postgres pg_dump -U postgres -Fc my_recipes > ...` as the unattended-backup path**,
  since `/api/backup` is session-authed like every other route and can't be curled by a cron job
  without first scripting a login. Chose the direct `docker exec pg_dump` route over adding a
  separate unauthenticated/API-key-gated backup endpoint — no new auth surface needed, and it's
  the same command an admin would already reach for on a self-hosted Docker box. Deliberately
  scoped it to the DB only (not `uploads/`) and pointed at a separate volume-level `rsync`/`tar`
  for photos, rather than reimplementing the tar-stream packaging outside the app just for a doc
  example. Verified the one-liner for real: ran it against the actual running container and
  confirmed `pg_restore -l` reads the output back as a valid archive.

## SPEC §4.6 step 3 — in-browser Prompt API (documentation gap, not a missed feature)

A review noted this had no DECISIONS.md entry. Confirmed via a repo-wide search: no code for it
exists anywhere (`lib/services/import.ts`'s `importFromWebpage` only ever does step 1 — JSON-LD —
then falls straight to step 2's server-side LLM call; there's no client-side inference component
and no page-fetch proxy endpoint for it either).

This was a deliberate skip, not an oversight — the very first instruction that kicked off this
project's Phase 0 explicitly named it: "No feature creep: anything in §8 (Non-Goals) stays out,
including the in-browser Prompt API if you're tempted — imports are server-side." (Note: SPEC.md's
own §8 Non-Goals list doesn't actually mention this — that instruction came from the user directly,
alongside the spec, at the start of the build.) SPEC §4.6 itself frames step 3 as "an optimization
when available," not a hard requirement, which is consistent with it being droppable without
under-delivering on the spec's actual functional ask (recipes still import correctly via steps 1
and 2 for every browser, Chrome-with-Gemini-Nano or not).

Not re-flagging this as something to build — it was already a deliberate call the user made
up front, not a gap that slipped through. Documenting it here purely to close the audit trail gap
the review found.

## 2026-07-07 — Fix: search was accent-sensitive

User-reported bug: "the search page is bugged," no further detail. Investigated by exercising
every filter (`q`, `categoryId`, `tag`, `ingredient`) against real recipe data via the live API
and the rendered page — all mechanically worked (correct results, no errors) until testing a
diacritic-free query: searching `salmao` against a recipe titled "Salmão ao molho de alcaparras"
returned zero results. Plain Postgres `ILIKE` is case-insensitive but not accent-insensitive, and
dropping diacritics when typing is extremely common in pt-BR (non-Brazilian keyboards, fast
typing, autocomplete) — this is a real, high-impact bug for the app's actual audience, not an edge
case.

- **Fix: wrap every search-path `ILIKE` in Postgres's `unaccent()`** (`lib/services/recipe.ts`'s
  new `unaccentIlike()` helper), applied to both sides of the comparison. `unaccent` is a standard
  Postgres contrib extension already bundled with `postgres:16-alpine` — not a new runtime
  dependency — enabled via a hand-authored custom migration (`drizzle-kit generate --custom`,
  since `CREATE EXTENSION` isn't something drizzle-kit can diff from `schema.ts`). Runs
  automatically on any deploy via the existing migration-on-boot entrypoint, same as every other
  migration.
- Verified for real: confirmed `salmao`/`camarao` (no accent) now return the matching recipes via
  the live API and the actual rendered `/recipes` search page, confirmed accented queries still
  work unchanged, and added a real-DB regression test (`lib/services/recipe.test.ts`) creating a
  recipe with a diacritic in its title and searching for it without one.

## 2026-07-07 — Feat: multiply ingredients by a factor

- **Unified servings-based scaling and factor-based scaling behind one number** rather than
  building the factor multiplier as a separate, parallel control. A servings ratio *is* a factor
  (`targetServings / originalServings`); the +/- servings stepper and the new 1x/1.5x/2x/3x
  quick-select buttons are just two different UIs for setting the same underlying multiplier. This
  also fixes a real pre-existing gap noticed while implementing this: recipes with no known
  `servings` (common for imports where the source never stated one) previously had **no scaling
  control at all** — the old component only rendered the +/- stepper when `originalServings` was
  truthy. The factor buttons now work unconditionally, since they don't need a baseline servings
  count to multiply by.
- **Extracted the shared logic** into `hooks/use-ingredient-scaling.ts` (the factor↔servings
  math + state) and `components/recipes/ScaleControls.tsx` (the buttons/stepper UI), used by both
  `ScalableIngredients` (recipe detail) and `CookModeClient` (Cook Mode) — both previously
  duplicated their own `+/-` servings logic verbatim; the new factor feature would have tripled
  that duplication if added separately to each.
- **`formatIngredientLine`'s second parameter changed from `{ originalServings, targetServings }`
  to a plain `factor: number`** — the servings pair was just a roundabout way of expressing a
  factor (`scaleQuantity` immediately divided them back down to a ratio). `lib/services/kitchen.ts`
  (the Alexa surface's ingredient scaling) is untouched — it calls `scaleQuantity`/
  `formatScaledQuantity` directly, not `formatIngredientLine`, so this change doesn't reach it, and
  the Alexa surface didn't need a "multiply by factor" affordance of its own.
- **A custom-factor text input sits alongside the quick presets** ("Outro") for values like 0.75x
  or 2.5x that aren't one of the four presets — parses a comma or period as the decimal separator
  (pt-BR types "1,5") and clears itself after applying.
- **No automated test for the interactive scaling behavior itself** — this project has
  deliberately skipped UI test coverage since Phase 0, and adding one now would've meant pulling in
  jsdom + `@testing-library/react` (neither installed) for a single hook. Verified instead with a
  real browser: installed Playwright (not previously a project dependency; used ad hoc for this
  verification only, not added to `package.json`), logged into the actual running dev server
  through the real `/login` form, and drove the real recipe detail page and Cook Mode — confirmed
  2x/3x/custom-1.5x all correctly multiply every ingredient's displayed quantity (including
  fraction-friendly rendering, e.g. 2 ovo → 4½ ovo at a 2.25x factor), confirmed the servings
  stepper and factor buttons stay in sync in both directions, and confirmed zero console errors.
  `formatIngredientLine`'s pure multiplication math itself is covered by `lib/format.test.ts`.

## 2026-07-07 — Feat: photos of the finished dish

- **Visibility is circle-shared, not private** — every other per-user recipe annotation (ratings
  in `lib/services/rating.ts`, notes in `lib/services/note.ts`) is scoped to the viewing user only.
  Cook photos deliberately break that pattern: a new `recipe_cook_photo` row is visible to every
  circle member, not just its uploader, because a photo of the finished dish is naturally a
  "look what I made" share in a family app, not a private annotation. **Deletion stays
  private-style** — only the uploader can delete their own photo (`deleteCookPhoto` filters by
  `userId` in its `WHERE`), matching the ownership model of ratings/notes even though visibility
  doesn't.
- **Reused the recipe cover-photo pipeline** rather than writing a second image processor:
  `processAndStoreImage`'s first parameter was generalized from a bare `recipeId` to a full
  `relativeDir` string (`recipes/{recipeId}` for cover photos, `recipes/{recipeId}/cooked` for cook
  photos), so both features share one sharp/HEIC-conversion/validation path. `deleteImageFiles` and
  the `MAX_UPLOAD_BYTES`/`ALLOWED_MIME_TYPES` validation are shared unchanged.
- **A separate per-user cap, not a per-recipe cap** — `MAX_PHOTOS_PER_RECIPE` (6, already defined
  for cover photos) is reused but counted per `(recipeId, userId)` pair via
  `countUserCookPhotos`, not per recipe overall. A shared gallery with a single recipe-wide cap
  would let one enthusiastic uploader crowd out everyone else's photos; capping per-uploader avoids
  that without needing a new constant.
- **New table `recipe_cook_photo`** (migration `0003_ordinary_gressill.sql`) rather than reusing
  `recipe_image` with a "kind" discriminator column — cover photos are author-owned and singular
  per recipe (used as the hero image), cook photos are a multi-user append-only gallery with a
  different ownership/deletion model; conflating them into one table with a type flag would have
  made every cover-photo query need an extra `WHERE kind = 'cover'` filter for no real benefit.
- **Verified for real** against the live dev server and its actual Postgres container: bootstrapped
  two real accounts through the actual invite-code + sign-up flow (`POST /api/invite` →
  `POST /api/auth/sign-up/email`, then `POST /api/invite/generate` from account 1 to mint a second
  code for account 2), uploaded photos as both users against a real existing recipe, confirmed both
  users' photos list for both viewers (circle-shared), confirmed the non-uploader gets 403 on
  `DELETE /api/recipes/:id/cook-photos/:photoId` while the uploader gets 200, confirmed the 7th
  upload from one user hits the per-user cap with a 400 while the other user is unaffected, and
  confirmed `GET /api/uploads/...` serves the stored `.webp` back correctly. All test accounts,
  invite codes, DB rows, and uploaded files were deleted afterward.

## 2026-07-07 — Feat: "pulo do gato" tips, optionally linked to a step

- **Circle-shared, like cook photos, not private like ratings/notes** — same reasoning as the cook
  photos feature: a cooking trick only helps if everyone in the circle can see it. Deletion is
  still author-only (`deleteTip` filters by `userId`), matching the same ownership pattern as cook
  photos.
- **`stepIndex` is a plain nullable integer, not a foreign key** — `recipe.steps` is a `jsonb`
  array on the `recipe` row, not a separate table (see `RecipeStep` in `lib/db/schema.ts`), so
  there's no step row to reference. `stepIndex: null` means a general, recipe-wide tip;
  `stepIndex: 0..n` is a plain array index into that recipe's `steps`. This means a tip silently
  points at the wrong step if the recipe's steps are later reordered or deleted via the editor —
  accepted as a real but minor edge case (same class of risk as `mealPlanEntry`/`shoppingListItem`
  referencing ingredients by name rather than a stronger key elsewhere in this codebase); not
  worth a step-identity system for a "quick tip" feature.
- **UI is a cat icon (`lucide-react`'s `Cat`) next to each step** in `RecipeSteps.tsx` — clicking it
  opens a `Popover` (`StepTip.tsx`) showing that step's existing tips (author + delete-own) plus an
  inline add form; a small badge shows the tip count so a step with a known trick is visible before
  clicking. A separate "Pulo do gato" section (`GeneralTips.tsx`) lower on the recipe page holds
  tips with no step attached, mirroring the private-notes/cook-photos section pattern already on
  that page.
- **Split `RecipeSteps` into its own client component**, replacing what had been static
  server-rendered JSX directly in `app/(app)/recipes/[id]/page.tsx` — the per-step popover-open
  state and tip list need to live in the client. The step-linked and general tips are fetched once
  server-side (`listTips`) and partitioned by `stepIndex === null` before being handed to the two
  components as separate props, avoiding a second round-trip API call for what's otherwise one
  small table.
- **Verified for real** against the live dev server: bootstrapped two real accounts through the
  actual invite+sign-up flow, added a step-linked tip as one user and a general tip as the other via
  the real API, confirmed both are visible to both users (circle-shared) and correctly separated by
  `stepIndex`, confirmed the non-author gets 403 deleting the other's tip while the author gets 200,
  confirmed an empty body is rejected with 400, and drove the actual browser UI via Playwright
  (logged in through the real `/login` form): confirmed a cat icon renders next to every step,
  confirmed the general tip shows in the "Pulo do gato" section rather than any step's popover,
  added a new tip through the real per-step form and watched the badge count update to 1 and the
  tip text render in the popover — zero console errors. All test accounts, invite codes, and tip
  rows were deleted afterward.

## 2026-07-07 — Fix: YouTube import uses the video thumbnail URL directly

- **Only YouTube imports change — webpage (JSON-LD/LLM) imports still download and re-host their
  source image locally**, unchanged. The bug report was specifically about YouTube; a generic
  webpage's `og:image` can disappear or block hotlinking, so downloading it remains the safer
  default there. `RecipeDraft.videoUrl` (only ever set by `importFromYouTube` in
  `lib/services/import.ts`) is the existing, already-correct signal for which case applies —
  no new field needed to distinguish them.
- **`recipeImage.path` can now hold either a local relative path or a full external URL** — no
  schema/column change; the column's meaning was already "whatever a browser needs to render this
  image," and an absolute `https://` URL satisfies that just as well as a relative path resolved
  through `/api/uploads/`. Added `lib/image-url.ts` (`isExternalImageUrl`/`imageSrc`, client-safe,
  no Node imports) as the one shared place that distinguishes the two, and updated every call site
  that built a `/api/uploads/${path}` src from a `recipeImage.path` — the recipe detail page's hero
  image, `RecipeCard` (the recipe list — "the main page" the request called out), and
  `ImageManager`'s already-saved-image previews. `CookPhotoGallery`/`recipeCookPhoto.path` was left
  untouched since cook photos are never externally sourced.
- **Locked the passthrough to `i.ytimg.com` only** (`ALLOWED_EXTERNAL_IMAGE_HOSTS` in
  `lib/image-constants.ts`), checked server-side in `POST /api/recipes/:id/images` before ever
  writing a `recipeImage` row. Without this, the same `{imageUrl, external: true}` JSON body shape
  would let a client attach *any* URL to a recipe's image with no server-side fetch/validation at
  all — low severity (it's rendered as a plain `<img src>`, not fetched server-side, so this isn't
  SSRF), but there's no reason to allow it beyond the one real use case, so it's allowlisted rather
  than left open.
- **`deleteImageFiles` now no-ops for an external URL** — there's no local file to remove; the
  webp double-file convention (`thumbnailPathFor`) never existed for an external URL. Regression
  test added in `lib/services/image.test.ts` confirming this doesn't throw (a naive
  `path.join(UPLOADS_DIR, "https://...")` wouldn't crash either, since it isn't an absolute path
  and `fs.rm(..., {force:true})` swallows "not found," but the explicit early-return is clearer
  than relying on that).
- **Fixed a related, smaller pre-existing gap noticed while reading `NewRecipeClient.tsx`**: when
  a YouTube import's LLM extraction fails to find a full recipe (`recipeFound: false` — SPEC
  §4.6b step 3, falls back to manual entry with just title/videoUrl prefilled), the thumbnail URL
  was silently dropped entirely — `setManualPrefill` never carried `result.imageUrl` through to
  `RecipeForm`'s `initialRemoteImageUrl` prop. Since this is the same YouTube-thumbnail-handling
  path the request was about, not a separate feature, fixed it alongside: `manualPrefill` state now
  holds `{ values, imageUrl }` instead of just form values.
- **Manual picture upload during import already overrode the auto-thumbnail before this change**
  (`RecipeForm.tsx`'s existing `pendingFiles.length === 0 && initialRemoteImageUrl` gate) — nothing
  needed here; verified this still holds since the gate is untouched.
- **Verified for real**, hitting the actual external YouTube Data API (a real `YOUTUBE_API_KEY` is
  configured in this environment) against a real, stable, extremely well-known video
  (`dQw4w9WgXcQ`, chosen specifically for its stability as a public test fixture — not a real
  recipe, so `recipeFound: false`, which is irrelevant to what was being tested): confirmed
  `POST /api/recipes/import` returns `imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"`;
  created a real recipe via the API and attached that URL through the new
  `{imageUrl, external: true}` path — confirmed the stored `recipeImage.path` is the raw URL
  verbatim, confirmed **no file or directory was ever created under `uploads/`**, confirmed a
  disallowed host and a malformed URL are both rejected with 400 and insert no row, confirmed the
  pre-existing non-external download path is completely unchanged (still downloads and stores a
  local `.webp` + thumbnail when `external` is omitted), and confirmed deleting that downloaded
  image still removes its local files. Drove the actual browser via Playwright to the real recipe
  list page and visually confirmed the real Rick Astley YouTube thumbnail renders directly from
  `i.ytimg.com` in the recipe card (screenshot-verified, not just DOM-attribute-checked — an
  earlier screenshot taken before the image finished loading showed a blank placeholder, which
  a longer wait resolved, confirming it was a timing artifact and not a rendering bug). All test
  data (recipe, image row, account, invite code) was deleted afterward — the recipe's cascading
  delete on its author's account was relied on for final cleanup, verified empty after.

## 2026-07-08 — Feat: visual animations and transitions pass

User request: make the app "look awesome" with animations. Presented 15 candidate animations
(shared-element transitions, cook mode polish, micro-interactions, loading states) and the user
chose "build all of them." Fourteen shipped; one (theme-toggle cross-fade) was scoped out — see
below.

- **No new npm dependency added.** Everything is built on native CSS (`tw-animate-css`, already a
  dependency, supplies `animate-in`/`animate-out` + `fade-in-*`/`slide-in-from-*`/`zoom-in-*`
  utilities used throughout) plus the browser's native View Transitions API and Web Animations
  primitives (`element.animate`/pointer events for the lightbox drag). Considered adding `motion`
  for the meal-plan "fly-in" and the photo lightbox, but both turned out to be achievable by hand
  at the actual UI scale involved — not worth ~5kb + a new dependency for this app's size.

- **Shared-element card→detail transition (`components/ViewTransitions.tsx`).** Next 16.2's
  `experimental.viewTransition` flag requires React's experimental channel (confirmed this
  project's `react@19.2.7` doesn't export a `ViewTransition` component — checked
  `Object.keys(require("react"))` directly rather than assuming), which is too big a dependency
  swap for this. Hand-rolled the well-known workaround instead: `ViewTransitionsProvider` wraps
  `document.startViewTransition()` around a `router.push()`, resolving the transition's pending
  promise via a `useEffect` on `usePathname()` (i.e. once the new route has actually committed) —
  the same trick the `next-view-transitions` package uses internally, just inlined at ~40 lines
  instead of adding the package. `TransitionLink` is a drop-in `next/link` replacement using it.
  `RecipeCard`'s image wrapper and the recipe detail page's hero image both get a matching
  `view-transition-name={`recipe-hero-${id}`}` so the photo morphs/expands between the two rather
  than jump-cutting. Deliberately did *not* also tag the title/metadata block — the detail page's
  header layout (title + edit button row) doesn't share the card footer's shape (tags + author),
  and morphing mismatched-shape blocks looked worse than just letting them cross-fade individually.

- **Cook mode step transitions (`CookModeClient.tsx`).** Steps slide in from the right on
  "Próxima," from the left on "Voltar," via a `direction` state flag and a `key={currentStepIndex}`
  remount. **Deliberately scoped the key to only the step-number/text wrapper, not all of `<main>`**
  — `StepTimer` sits in the same `<main>` and owns its own countdown `useState`, and Phase 2's
  decision above says a step's timer "keeps running even if you navigate to another step and back."
  An earlier draft keyed the whole `<main>`, which would have force-remounted `StepTimer` (and
  silently reset any running countdown) on every step change — caught this via code review before
  it shipped, not by observing a live bug.

- **Circular timer ring, `StepTimer`.** Replaced the plain mm:ss text with an SVG ring
  (`stroke-dasharray`/`stroke-dashoffset`, animated via a plain CSS `transition` so it eases
  between each 1-second tick rather than jumping) plus a `animate-pulse-glow` ring pulse when it
  hits zero. Verified the depletion math for real: started a 30-minute timer on "Salmão ao molho de
  alcaparras"'s step 2, waited ~2 minutes, and confirmed `stroke-dashoffset` (12.67) matched
  `circumference × (1 − remaining/total)` exactly for a displayed 27:59 remaining.

- **Found and fixed a real bug while verifying the rating-star pop animation
  (`RatingStars.tsx`):** combining `fill-primary` (Tailwind's SVG fill-color utility) with
  `fill-mode-both` (tw-animate-css's animation-fill-mode utility) in the same `cn()` call causes
  `tailwind-merge` to silently drop `fill-primary` — it pattern-matches both onto the same `fill-*`
  conflict group by prefix, with no awareness that `fill-mode-*` is a different (non-Tailwind-core)
  utility family. Reproduced it directly (`twMerge("fill-primary text-primary", "fill-mode-both")`
  → `"text-primary fill-mode-both"`) before touching any code. Filled stars would have rendered as
  hollow outlines instead of solid terracotta. Fix: dropped `fill-mode-both` from `RatingStars` —
  it was there to hold the pre-animation state during the staggered `animationDelay`, but the star
  pop only animates `transform` (`zoom-in-50`), not `opacity`, so there's nothing to flash before
  the delayed start and the fill-mode was unnecessary there in the first place. Verified fixed via
  the live DOM (`fill-primary` present again) and a screenshot (4/5 stars solid terracotta).
  Audited every other `fill-mode-both` use site in this pass (`RecipeCard`, `WeekCalendar` entry
  chips) — neither combines it with a `fill-*` color utility, so this was isolated to
  `RatingStars`.

- **Ingredient scaling "roll-in" (`ScalableIngredients.tsx`, `CookModeClient.tsx`).** Simpler than
  a literal per-digit odometer: each `<li>` is keyed by `` `${i}-${factor}` ``, so changing the
  scale factor remounts every line and replays a small blur+translateY `animate-number-roll`
  keyframe. Verified for real: doubling "Camarão Cremoso" to 2x correctly rendered "1.000 g
  camarão" with the roll class present.

- **Shopping list check-off (`ShoppingListClient.tsx`, `components/ui/checkbox.tsx`).** Replaced
  lucide's `CheckIcon` with a custom `<polyline pathLength="16">` so the checkmark draws via
  `stroke-dasharray`/`dashoffset` on mount (Radix's `Checkbox.Indicator` already only mounts when
  checked, so no extra state needed — the draw animation just replays naturally every check).
  Text no longer uses the `line-through` utility; instead a `scale-x-0 → scale-x-100` pseudo-line
  sweeps across a nested `inline-block` span sized to just the text (not the full flex-1 row) so it
  doesn't stretch into empty space. Added a `bg-success/5` settle tint on the row itself. All three
  confirmed together via a real check: solid checkbox + sweep + green tint on "alecrim."

- **Meal-plan "landing" animation, not a literal fly-in (`WeekCalendar.tsx`).** The original
  suggestion was a cross-element fly from the picker into the calendar cell; rescoped after looking
  at the actual layout — the "+ Adicionar" trigger already sits inside the same small cell the new
  entry lands in, so a literal FLIP-animated fly would travel almost no distance and add
  complexity for no visible payoff. Shipped a bounce-in (`zoom-in-75` + custom overshoot easing)
  instead, which reads as "landing" regardless of source position. Relies on React's own
  reconciliation for the "only new/moved entries animate" behavior — entries keep their `entry.id`
  key, so `router.refresh()` doesn't remount unrelated existing chips, only ones that are new or
  moved to a different cell (a real DOM move, since it's a different parent in the tree).

- **Button feedback (`components/ui/button.tsx` + `SendToKitchenButton`/`GenerateFromRecipes`).**
  `active:scale-[0.97]` added to the shared `buttonVariants` base class, so every button in the app
  gets tactile press feedback for free. Added a transient checkmark-morph state (`justSent`/
  `justGenerated`, auto-reverting after 1.2s) to the two buttons whose success is otherwise only
  visible via a toast or a full-page data refresh. Deliberately **not** added to
  `GenerateShoppingListButton` (the plan page's version) — it `router.push()`s away immediately on
  success, so a 1.2s morph would never actually be seen.

- **Import box "progress theater" (`ImportBox.tsx`).** Cross-fading status phrases
  (`IMPORT_PHASES`, thresholds at 0/3/8/16/26s) plus an indeterminate sweeping progress bar,
  replacing the bare spinner+seconds-elapsed counter. Purely cosmetic — doesn't reflect real
  pipeline phase boundaries (the app has no server-sent progress events) — but timed to roughly
  track the real JSON-LD → LLM-fallback → image-fetch pipeline described in the Phase 1 entries
  above. Verified end-to-end with a real import against `https://example.com/` (no JSON-LD, so it
  falls through to the manual-entry prefill path per existing behavior) — completed cleanly with
  zero console errors, though fast enough in local dev that the phase-cycling couldn't be caught
  mid-flight in a screenshot; confirmed correct by DOM/class inspection instead.

- **Skeleton loading states.** New `app/(app)/recipes/loading.tsx` and
  `app/(app)/recipes/[id]/loading.tsx`, both built on a new small `components/ui/skeleton.tsx`
  (shadcn's usual pattern — a `bg-muted` block with a sweeping shimmer gradient). These are
  Next.js App Router route-segment `loading.tsx` files, so they need no wiring — the framework
  Suspense-boundaries the page automatically.

- **Hero image parallax.** Implemented as a CSS scroll-driven animation
  (`animation-timeline: scroll(root block)`) wrapped in `@supports (animation-timeline: scroll())`
  — pure progressive enhancement, since Safari doesn't support scroll-driven animations as of this
  writing; unsupported browsers just get a static (non-parallaxed) hero image rather than an error
  or a JS scroll-listener fallback, which felt like the right amount of investment for a
  decorative-only effect.

- **Cook photo lightbox (`components/recipes/PhotoLightbox.tsx`).** Click-to-zoom uses the same
  View Transitions primitive as the card→detail transition, but same-document this time (no
  routing involved) — `document.startViewTransition(() => flushSync(update))`, the standard
  React+native-View-Transitions pairing (`flushSync` forces the state update to commit
  synchronously inside the transition callback, which native View Transitions require). The
  `view-transition-name` is handed off between the grid thumbnail and the fullscreen `<img>`
  (never both at once — verified this matters, since two elements sharing one
  `view-transition-name` at the same DOM snapshot throws) via a ternary keyed on whether that
  photo's lightbox is currently open. Swipe-to-dismiss is hand-rolled pointer-event dragging
  (`translateY` follows the pointer, releases past a 120px threshold close, otherwise springs
  back). **Verified for real** end-to-end: uploaded a real synthetic photo through the actual
  `POST /api/recipes/:id/cook-photos` endpoint (not a mock), confirmed the lightbox opens with the
  correct image and a dimmed backdrop, and confirmed the close button correctly tears it down. The
  drag-to-dismiss gesture itself couldn't be mechanically verified through synthetic
  `PointerEvent`s — `Element.setPointerCapture` requires a browser-trusted active pointer, which a
  script-dispatched event doesn't provide, so this is a real limitation of headless verification
  rather than a known app bug; the underlying logic (a threshold compared against `dragY` state) is
  the same simple pattern already verified elsewhere in this pass.

- **Empty-state bob.** A single `animate-gentle-bob` keyframe (subtle translateY + rotate loop)
  applied to the `ChefHat`/`ShoppingCart` icons on the two empty-state screens.

- **Skipped: theme-toggle cross-fade.** This was suggestion #14 from the original list (a circular
  reveal when switching light/dark). Confirmed via the existing "App logo" decision above that
  **no dark-mode toggle is wired into the app at all** — `next-themes` is an installed dependency
  but never mounted as a provider in `app/layout.tsx`, so `.dark` is inert CSS with nothing to
  trigger it. Building a cross-fade transition for a toggle that doesn't exist would mean building
  the toggle itself first — a real feature, not an animation — so this was dropped rather than
  silently scope-creeping into "also add dark mode." Flagging here in case dark mode is wanted as
  its own future request.

- **Verified for real, end-to-end, against the live dev server and its actual Postgres
  container**: bootstrapped a real throwaway account through the actual invite+sign-up flow
  (`npx tsx lib/db/create-invite.ts` → real `/signup` form), then drove the real browser against
  the four pre-existing real recipes for every item above — card grid stagger, card→detail hero
  morph, cook-mode step slide + timer ring math, rating star pop (which is how the `fill-mode-both`
  bug above was actually caught), ingredient-scaling roll, shopping-list check-off, meal-plan
  bounce-in, button success morphs, import theater, and the cook-photo lightbox (including a real
  file upload). Zero console errors across all of it. All test data — the account, its rating,
  shopping list, meal-plan entry, cook-photo row and its two on-disk `.webp` files, and the invite
  code — was deleted afterward; re-queried the DB to confirm only the real pre-existing account and
  data remained.

- **Fixed: `StepTimer` losing its countdown on navigation.** Previously `CookModeClient` only ever
  conditionally rendered one `<StepTimer>` at the position of the *current* step
  (`{step?.durationMinutes && <StepTimer .../>}`), so stepping to a step with no `durationMinutes`
  and back unmounted and remounted it, resetting the countdown — see the flagged gap this replaces.
  Now every step with a `durationMinutes` gets its own permanently-mounted `<StepTimer>`, wrapped in
  a `<div key={i}>` toggled between `contents` (current step, so it lays out as if it were a direct
  child of `<main>`) and `hidden` (every other step) — visibility is CSS-only, so no `StepTimer`
  instance ever unmounts and its `remaining`/`running` state (and the running `setInterval`) survive
  navigating away and back, matching the Phase 2 decision's original intent.

## Deploy on LocalInfra (Raspberry Pi)

- **Postgres moves to LocalInfra.** The app no longer ships its own `postgres` service: it joins the
  external `localinfra_postgres` network and uses its own role/database (`my_recipes`, from
  `LocalInfra/scripts/new-project.sh my_recipes --no-redis`), matching how yarg-aggregator runs on
  the same Pi. The project name is `my_recipes` because `new-project.sh` only accepts
  `[a-z][a-z0-9_]`. No Redis: §2/§8's "no job queue" still holds.

- **`pg_dump` client is now v17** (`PG_MAJOR` build arg), replacing the Phase 0 "Postgres 16"
  decision — LocalInfra runs Postgres 17, and an older `pg_dump` refuses to dump a newer server.
  `unaccent` (migration 0002) needs no change: it's a trusted extension since PG13, so the
  database owner can create it without superuser.

- **Host port 3001, image tagged `my-recipes:latest`.** yarg owns 3000 on the Pi. The fixed image
  tag lets `deploy.sh` keep the outgoing build as `my-recipes:previous`, so `--rollback` restores
  the actual previous build instead of restarting the current one (the old rollback only
  recreated the container from the same image).

- **`deploy.sh` deploys through the `umbrel` Docker context** instead of SSH + `git pull` on a
  clone, the same model LocalInfra and yarg use; the `DEPLOY_HOST/USER/PORT` variables are gone.

- **`TZ=America/Sao_Paulo` in the container.** The meal plan computes "this week" on the server
  with `new Date()`; in a UTC container, Sunday after 21:00 BRT already showed next week. Node
  ships full ICU, so `TZ` works on Alpine without `tzdata`.

- **`.env` = Pi, `.env.local` = local dev** (yarg's convention). `db:migrate`, `db:studio`,
  `db:seed` and `db:invite` run through `node --env-file-if-exists=.env.local` so they can't
  silently target the Pi's `DATABASE_URL`; drizzle-kit's own `.env` loading never overrides a
  variable that is already set.

- **First invite on the Pi: `scripts/create-invite.mjs`.** `lib/db/create-invite.ts` needed tsx,
  which isn't in the production image; the `.mjs` replaces it for both local dev
  (`npm run db:invite`) and the container.

- **Photos move to S3 (Garage on LocalInfra), superseding SPEC §4.8's "no external object
  storage" and the uploads volume.** Garage was picked over SeaweedFS, RustFS and a MinIO fork
  (MinIO's community edition was archived in 2026): lightest footprint on the Pi, official arm64
  releases, and per-app isolation that matches LocalInfra's model — one key per project, granted
  read/write on its own bucket only (verified: AccessDenied on other buckets, can't create or
  delete buckets, lists only its own). Still self-hosted, so §4.8's intent (no third-party
  cloud) holds. The bucket is private: `/api/uploads/...` keeps streaming photos to signed-in
  users, now from S3. Object keys are the same relative paths the DB already stored, so moving
  existing photos needed no migration — `scripts/upload-photos-to-s3.mjs` copies a folder in,
  re-rendering 400px thumbnails at 800px on the way (replacing the boot-time
  `regenerate-thumbnails.mjs`, which only made sense on a local disk).

- **No separate backup for photos.** Garage stores them on the Pi's external RAID 1 drive; the
  user chose RAID 1 as enough (it covers a dead disk, not deletions or losing the Pi). The in-app
  backup still bundles every object for a manual copy.

- **AWS SDK with `requestChecksumCalculation: "WHEN_REQUIRED"`.** Recent SDK versions add CRC32
  checksums to every PutObject by default, an AWS-specific extension; only sending them when an
  operation requires one keeps the client compatible with Garage across versions.

- **`/api/health` also checks the bucket** (HeadBucket), so a deploy with wrong S3 credentials
  fails its health check instead of failing on the first photo upload.

- **Fixed: `sharp` failed to load in the Docker image** (`libvips-cpp.so.8.18.3: No such file`),
  which broke every photo upload in production. The runner stage ran `npm install --no-save pg
  drizzle-orm` with no lockfile, which re-resolves *every* dependency to its latest version
  (sharp 0.35.5 + libvips 8.18.7); the standalone output then laid the locked sharp 0.35.3 on top,
  whose binary expects libvips 8.18.3. Latent until sharp shipped a patch release. The runner now
  runs `npm ci --omit=dev` from the lockfile, so every copy agrees. Found while testing the S3
  switch in the real image; unrelated to S3 itself.

- **Deploy follows LocalInfra's standard (`LocalInfra/DEPLOYING-APPS.md`).** `deploy.sh` is now
  the shared `LocalInfra/templates/app/deploy.sh`, identical in every app: it reads the service,
  container and image from `docker-compose.yml`, checks the external networks before the build,
  and warns when `.env` still has local values. Its default no longer bumps, commits and pushes:
  a plain `./deploy.sh` deploys the working tree, and `--release` does the bump + commit + push
  (the old default) — deploying should never publish to GitHub as a side effect. First-time
  setup uses `LocalInfra/scripts/provision-app.sh`, which writes the credentials into `.env`.

## 2026-10-15 — Fix: YouTube transcripts were never fetched

- **Transcripts come from the caption track, via the ANDROID client.** Innertube's
  `get_transcript` endpoint (`info.getTranscript()`) started answering HTTP 400, and the error was
  swallowed, so every video without a recipe in its description fell through to manual entry
  (found on a Portuguese recipe video, `zrdG7zsIZns`). The WEB client's caption URLs now need a PO
  token (they return an empty body); the ANDROID client's don't. `fetchTranscriptText` reads the
  track as `json3`, preferring Portuguese, then creator-made over auto-generated captions.

- **Description and transcript go to the LLM together, in one call** (`context: "youtube"`),
  instead of description first and transcript second. Descriptions often hold the ingredient list
  with exact quantities and transcripts the method; seeing both gives a better draft than either
  alone, and a video with no recipe in its description costs one LLM call instead of two.

- **Failures in the YouTube path are logged** (`[youtube]`/`[import]` prefixes): no captions, a
  failed caption download, a Data API error, no recipe found, an LLM error. The import still falls
  back to manual entry, but the reason is now in the server logs; the silent fallback is what hid
  this bug. youtubei.js's own parser warnings (a stack trace per unrecognised page element) are
  silenced with `Log.setLevel(Log.Level.ERROR)`.

## 2026-10-16 — YouTube import quality (from `zrdG7zsIZns`)

- **Thumbnail: the largest one the video has** — `maxres` → `standard` → `high` → … The old pick,
  `high` (480x360), is a 4:3 frame with black bars around a 16:9 picture; only `maxres` (1280x720)
  is true 16:9, and some videos don't have it.

- **Titles are cleaned in code, not only in the prompt.** The prompt now asks for a sentence-case
  dish name, but the model still sometimes copies an all-caps video title, so `cleanVideoTitle`
  (`lib/youtube-utils.ts`) runs on the LLM's title and on the manual-entry fallback's title: it
  drops a channel suffix after `//` or `|` and lowercases a title that is ≥70% capitals
  ("CORAÇÃO DE BOI ACEBOLADO// receitas,casa e coisas." → "Coração de boi acebolado"). A title in
  mixed case is left alone, since lowercasing would lose proper nouns.

- **Quantity and unit come as a pair.** The prompt says both or neither, with `unidade` for
  counted items, and asks for an estimate (when estimation is allowed) for ingredients named with
  no amount at all; "um pouco de shoyu" came back as `1` with no unit, "dois dedos de água" as
  `2 unidade`. `extractRecipeWithLLM` also drops a unit that arrives without a quantity, which
  can't be scaled or merged. A quantity without a unit is left as is: code can't know the unit.

- **New unit token `csb` (colher de sobremesa, ~10 ml).** It was mapped to `cch` by the model
  and, in the line parser, to a bare `colher` (`csp`) with "de sobremesa" left in the name. It is
  roughly twice a `cch` and two thirds of a `csp`, so mapping it to either one gets the amount
  wrong. Added to `UNIT_ALIASES`, the fraction-friendly units in `lib/scale.ts` and the prompt.

- **Manual-entry fallback says why.** `NewRecipeClient` shows a short pt-BR notice above the form
  ("Não encontramos uma receita neste vídeo…"; "nesta página" for a webpage), as SPEC §4.6b step 3
  already asked for.

## 2026-10-16 — YouTube import batch run (57 videos)

- **An LLM failure is an import error, not "no recipe".** `importFromYouTube` used to catch every
  extraction error and fall back to manual entry, so an OpenRouter 402 (out of credits) told the
  user "Não encontramos uma receita neste vídeo". `LLMExtractionError` now propagates and the
  route answers 502 with the reason (and logs it). Manual entry is only for the model's own
  `recipeFound: false` or a video with neither description nor transcript. A network failure
  reaching OpenRouter is wrapped in `LLMExtractionError` too, so it isn't a generic 500.

- **Everything in Brazilian Portuguese.** An English-description video came back with Portuguese
  ingredients and English steps. The prompt now asks for every text field in pt-BR, translating
  if needed; the title rule no longer says "in the recipe's own language".

- **Step timers stop at 3 hours** (`MAX_STEP_DURATION_MINUTES = 180`). The model turned "14 days
  of fermentation" into `durationMinutes: 20160`, shown in cook mode as a "20160:00" countdown.
  The prompt keeps `durationMinutes` to active steps someone would time, and
  `extractRecipeWithLLM` drops values above the cap (or ≤ 0); the wait stays in the step text.
  3 hours covers long braises and bakes. `StepTimer` shows `h:mm:ss` from one hour up
  (`formatCountdown` in `lib/format.ts`), which also fixes old recipes that already hold big values.

- **"inferred"/"estimado" are stripped from notes** (`cleanIngredientNote`): the model sometimes
  wrote its estimate flag into the note ("picada, inferred"). `inferred` is forced to `false` when
  there is no quantity, since nothing was estimated.

- **Hyphens count as spaces in ingredient names**, so "pimenta-do-reino" / "pimenta do reino" and
  "cheiro-verde" / "cheiro verde" are one `ingredient` row and merge on shopping lists. The stored
  (and displayed) name is the hyphen-free form, which drops the official hyphenated spelling;
  accepted, since one row matters more for merging than the hyphen. **Existing rows need a data
  migration:** an ingredient saved before this keeps its hyphenated name, and saving a recipe now
  looks up the hyphen-free name, so it creates a second row and the two don't merge on a shopping
  list. The migration would, per hyphenated name, repoint `recipe_ingredient` and
  `shopping_list_item` to the hyphen-free row (renaming the hyphenated row when there is none) and
  delete the leftover. Not written yet. Find affected rows with
  `select name from ingredient where name like '%-%'`.

## 2026-10-16 — Ingredient sections ("Caldo", "Massa", "Recheio")

Multi-part recipes lost their structure on import: a risotto with "CALDO: 1 cebola" and
"RISOTO: 1/2 cebola" became "1.5 unidade cebola", and at least 11 of the 41 recipes from the
57-video playlist run listed one ingredient twice with no way to tell which part it was for.

- **A nullable label on each row, not a section table.** `recipe_ingredient.group_name` (TS
  `group`); a section is a run of consecutive rows (by `order`) with the same label, and null means
  no heading. Recipes saved before this have null everywhere and render exactly as before. A
  `recipe_ingredient_group` table would give sections their own order and ids, but nothing needs
  that yet, and the flat list keeps every existing reader (scaling, Alexa, shopping list) unchanged.
  `groupIngredientSections` (`lib/ingredient-groups.ts`) does the splitting for every view.

- **Labels are cleaned in code**, on import and again on save (`normalizeGroupLabel`): trailing
  colon dropped, "Para o recheio" -> "Recheio", all-caps -> sentence case, and a heading that only
  says "Ingredientes" is no section at all.

- **The LLM is asked for `group` per ingredient**, the same short label on each ingredient of a
  part, null for a single-list recipe, and told to list an ingredient once per part instead of
  summing it across parts.

- **JSON-LD: heading lines become sections.** schema.org's `recipeIngredient` is a flat string
  list with no sections, but sites often put a part's heading in it as its own line. A line ending
  in ":" with no digits ("Para o molho:", "MASSA:") now sets the section of the lines after it
  instead of becoming an ingredient named "Para o molho:".

- **The shopping list still merges across sections.** It merges by canonical ingredient and unit,
  never looked at the section, so 1 + 1/2 cebola is one 1.5 line to buy.

- **Editor: headings, not a per-row field.** A section shows as an indented block with its name
  in an input, its own "Adicionar ingrediente" and a "Remover seção" that keeps the ingredients
  (they join the section above). "Adicionar seção" starts a new one at the end. There's no
  drag-to-move between sections; delete and re-add a row to move it.
