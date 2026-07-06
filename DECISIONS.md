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
