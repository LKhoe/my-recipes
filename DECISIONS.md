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
