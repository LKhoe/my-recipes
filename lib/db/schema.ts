import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const mealSlotEnum = pgEnum("meal_slot", ["breakfast", "lunch", "dinner"]);

// A playlist import's video, from queued to its outcome. `no_recipe`: the video has no recipe the
// model could find; `cancelled`: dropped by the user before it ran.
export const importItemStatusEnum = pgEnum("import_item_status", [
  "pending",
  "running",
  "done",
  "no_recipe",
  "failed",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Better Auth tables (schema shape dictated by Better Auth's Drizzle adapter)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$default(() => randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Invite gate (SPEC §3)
// ---------------------------------------------------------------------------

export const inviteCode = pgTable(
  "invite_code",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    code: text("code").notNull().unique(),
    // Nullable to allow bootstrapping the very first invite via CLI before any user exists;
    // every invite generated through the app has a creator.
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    usedByUserId: text("used_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    usedAt: timestamp("used_at"),
  },
  (table) => [index("invite_code_code_idx").on(table.code)],
);

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export type RecipeStep = {
  text: string;
  durationMinutes?: number;
  videoTimestamp?: number;
};

export const recipe = pgTable(
  "recipe",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    servings: integer("servings"),
    prepTime: integer("prep_time"),
    cookTime: integer("cook_time"),
    steps: jsonb("steps").$type<RecipeStep[]>().notNull().default([]),
    sourceUrl: text("source_url"),
    videoUrl: text("video_url"),
    // Set on every recipe imported from a site or video, until its author marks it reviewed: the
    // draft came from a parser or a model and may hold mistakes.
    reviewPending: boolean("review_pending").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("recipe_author_id_idx").on(table.authorId),
    index("recipe_review_pending_idx").on(table.authorId, table.reviewPending),
    index("recipe_title_idx").on(table.title),
    index("recipe_deleted_at_idx").on(table.deletedAt),
  ],
);

export const recipeImage = pgTable(
  "recipe_image",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    order: integer("order").notNull().default(0),
  },
  (table) => [index("recipe_image_recipe_id_idx").on(table.recipeId)],
);

// Circle members' own "I made this" photos of the finished dish — distinct from recipeImage
// (the recipe's own cover photos, author-controlled). Visible to the whole circle, like the
// recipe itself, not private like ratings/notes: showing what everyone's actually cooked is the
// point of a shared family recipe box.
export const recipeCookPhoto = pgTable(
  "recipe_cook_photo",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("recipe_cook_photo_recipe_id_idx").on(table.recipeId),
    index("recipe_cook_photo_user_id_idx").on(table.userId),
  ],
);

// Circle-shared "pulo do gato" tips — like recipeCookPhoto, visible to everyone rather than
// private like rating/note, since a cooking trick is only useful if the whole circle can see it.
// `stepIndex` is a plain array index into recipe.steps (steps aren't a separate table), null for
// a general recipe-wide tip not tied to any single step.
export const recipeTip = pgTable(
  "recipe_tip",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    stepIndex: integer("step_index"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("recipe_tip_recipe_id_idx").on(table.recipeId),
    index("recipe_tip_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Ingredients (canonicalized — SPEC §4.5a)
// ---------------------------------------------------------------------------

export const ingredient = pgTable(
  "ingredient",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    name: text("name").notNull().unique(),
  },
  (table) => [index("ingredient_name_idx").on(table.name)],
);

export const recipeIngredient = pgTable(
  "recipe_ingredient",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredient.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 10, scale: 3 }),
    unit: text("unit"),
    note: text("note"),
    // Section heading ("Massa", "Recheio") for multi-part recipes; null = no heading. A section is
    // a run of consecutive rows (by `order`) sharing the same label.
    group: text("group_name"),
    // An "or" option for the nearest row above it that isn't one ("manteiga" ou "margarina"); see
    // lib/ingredient-alternatives.ts.
    isAlternative: boolean("is_alternative").notNull().default(false),
    order: integer("order").notNull().default(0),
  },
  (table) => [
    index("recipe_ingredient_recipe_id_idx").on(table.recipeId),
    index("recipe_ingredient_ingredient_id_idx").on(table.ingredientId),
  ],
);

// ---------------------------------------------------------------------------
// Categories & Tags (SPEC §4.2)
// ---------------------------------------------------------------------------

export const category = pgTable("category", {
  id: text("id")
    .primaryKey()
    .$default(() => randomUUID()),
  name: text("name").notNull().unique(),
});

export const tag = pgTable("tag", {
  id: text("id")
    .primaryKey()
    .$default(() => randomUUID()),
  name: text("name").notNull().unique(),
});

export const recipeCategory = pgTable(
  "recipe_category",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("recipe_category_unique").on(table.recipeId, table.categoryId),
    index("recipe_category_category_id_idx").on(table.categoryId),
  ],
);

export const recipeTag = pgTable(
  "recipe_tag",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("recipe_tag_unique").on(table.recipeId, table.tagId),
    index("recipe_tag_tag_id_idx").on(table.tagId),
  ],
);

// ---------------------------------------------------------------------------
// Ratings & private notes (SPEC §4.7)
// ---------------------------------------------------------------------------

export const rating = pgTable(
  "rating",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("rating_user_recipe_unique").on(table.userId, table.recipeId),
    index("rating_recipe_id_idx").on(table.recipeId),
  ],
);

export const note = pgTable(
  "note",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("note_user_recipe_unique").on(table.userId, table.recipeId),
    index("note_recipe_id_idx").on(table.recipeId),
  ],
);

// ---------------------------------------------------------------------------
// Meal planning (SPEC §4.4) — circle-shared, not per-user
// ---------------------------------------------------------------------------

export const mealPlanEntry = pgTable(
  "meal_plan_entry",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    date: date("date").notNull(),
    slot: mealSlotEnum("slot").notNull(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    addedByUserId: text("added_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("meal_plan_entry_date_idx").on(table.date),
    index("meal_plan_entry_recipe_id_idx").on(table.recipeId),
  ],
);

// ---------------------------------------------------------------------------
// Shopping lists (SPEC §4.5)
// ---------------------------------------------------------------------------

export const shoppingList = pgTable(
  "shopping_list",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("shopping_list_user_id_idx").on(table.userId)],
);

export const shoppingListItem = pgTable(
  "shopping_list_item",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    shoppingListId: text("shopping_list_id")
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    // Nullable: items added free-form by voice (§9.1) have no canonical ingredient.
    ingredientId: text("ingredient_id").references(() => ingredient.id, {
      onDelete: "set null",
    }),
    customName: text("custom_name"),
    quantity: numeric("quantity", { precision: 10, scale: 3 }),
    unit: text("unit"),
    checked: boolean("checked").notNull().default(false),
    order: integer("order").notNull().default(0),
  },
  (table) => [
    index("shopping_list_item_shopping_list_id_idx").on(table.shoppingListId),
    index("shopping_list_item_ingredient_id_idx").on(table.ingredientId),
  ],
);

// ---------------------------------------------------------------------------
// Playlist imports — a Postgres-backed queue (see DECISIONS.md "Playlist import")
// ---------------------------------------------------------------------------

export const importBatch = pgTable(
  "import_batch",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    // LLM tier the user picked (lib/llm-tiers.ts)
    tier: text("tier").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Hidden from the progress popup once the user closes it.
    dismissedAt: timestamp("dismissed_at"),
  },
  (table) => [index("import_batch_user_id_idx").on(table.userId)],
);

export const importBatchItem = pgTable(
  "import_batch_item",
  {
    id: text("id")
      .primaryKey()
      .$default(() => randomUUID()),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatch.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    position: integer("position").notNull(),
    status: importItemStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    // The recipe made from the video; for a `refillSteps` item, the recipe whose method is fetched.
    recipeId: text("recipe_id").references(() => recipe.id, { onDelete: "set null" }),
    // Fills in the method of an existing recipe instead of creating one ("Buscar modo de preparo").
    refillSteps: boolean("refill_steps").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("import_batch_item_batch_id_idx").on(table.batchId),
    index("import_batch_item_status_idx").on(table.status),
  ],
);

// A single row: when the queue may start videos again after YouTube blocked the captions. In the
// database so a restart doesn't make the loop try, get blocked again and extend the block.
export const importQueueState = pgTable(
  "import_queue_state",
  {
    id: text("id").primaryKey().default("singleton"),
    pausedUntil: timestamp("paused_until"),
  },
  (table) => [check("import_queue_state_singleton_id", sql`${table.id} = 'singleton'`)],
);

// A video's captions, kept once downloaded: YouTube blocks the server's IP for hours when captions
// are fetched too often, so a video is never downloaded twice (retries, "Buscar modo de preparo").
export const videoTranscript = pgTable("video_transcript", {
  videoId: text("video_id").primaryKey(),
  text: text("text").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Kitchen state — circle-wide singleton (SPEC §9.1)
// ---------------------------------------------------------------------------

export const SINGLETON_KITCHEN_STATE_ID = "singleton";

export const kitchenState = pgTable(
  "kitchen_state",
  {
    id: text("id").primaryKey().default(SINGLETON_KITCHEN_STATE_ID),
    activeRecipeId: text("active_recipe_id").references(() => recipe.id, {
      onDelete: "set null",
    }),
    servingsOverride: integer("servings_override"),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // DB-enforced singleton: the primary key already blocks a second row from ever being
    // inserted, but this additionally guarantees the one row that exists can only ever be
    // "singleton" — a stray insert/update with a different id fails loudly at the DB instead of
    // silently creating a second, never-read kitchen_state row that the app would just ignore.
    check("kitchen_state_singleton_id", sql`${table.id} = 'singleton'`),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
  recipes: many(recipe),
  ratings: many(rating),
  notes: many(note),
  cookPhotos: many(recipeCookPhoto),
  tips: many(recipeTip),
  createdInviteCodes: many(inviteCode, { relationName: "createdInvites" }),
}));

export const recipeRelations = relations(recipe, ({ one, many }) => ({
  author: one(user, { fields: [recipe.authorId], references: [user.id] }),
  images: many(recipeImage),
  cookPhotos: many(recipeCookPhoto),
  tips: many(recipeTip),
  ingredients: many(recipeIngredient),
  categories: many(recipeCategory),
  tags: many(recipeTag),
  ratings: many(rating),
  notes: many(note),
}));

export const recipeCookPhotoRelations = relations(recipeCookPhoto, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeCookPhoto.recipeId], references: [recipe.id] }),
  user: one(user, { fields: [recipeCookPhoto.userId], references: [user.id] }),
}));

export const recipeTipRelations = relations(recipeTip, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeTip.recipeId], references: [recipe.id] }),
  user: one(user, { fields: [recipeTip.userId], references: [user.id] }),
}));

export const recipeImageRelations = relations(recipeImage, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeImage.recipeId], references: [recipe.id] }),
}));

export const ingredientRelations = relations(ingredient, ({ many }) => ({
  recipeIngredients: many(recipeIngredient),
}));

export const recipeIngredientRelations = relations(recipeIngredient, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeIngredient.recipeId], references: [recipe.id] }),
  ingredient: one(ingredient, {
    fields: [recipeIngredient.ingredientId],
    references: [ingredient.id],
  }),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  recipeCategories: many(recipeCategory),
}));

export const tagRelations = relations(tag, ({ many }) => ({
  recipeTags: many(recipeTag),
}));

export const recipeCategoryRelations = relations(recipeCategory, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeCategory.recipeId], references: [recipe.id] }),
  category: one(category, { fields: [recipeCategory.categoryId], references: [category.id] }),
}));

export const recipeTagRelations = relations(recipeTag, ({ one }) => ({
  recipe: one(recipe, { fields: [recipeTag.recipeId], references: [recipe.id] }),
  tag: one(tag, { fields: [recipeTag.tagId], references: [tag.id] }),
}));

export const ratingRelations = relations(rating, ({ one }) => ({
  user: one(user, { fields: [rating.userId], references: [user.id] }),
  recipe: one(recipe, { fields: [rating.recipeId], references: [recipe.id] }),
}));

export const noteRelations = relations(note, ({ one }) => ({
  user: one(user, { fields: [note.userId], references: [user.id] }),
  recipe: one(recipe, { fields: [note.recipeId], references: [recipe.id] }),
}));

export const mealPlanEntryRelations = relations(mealPlanEntry, ({ one }) => ({
  recipe: one(recipe, { fields: [mealPlanEntry.recipeId], references: [recipe.id] }),
  addedBy: one(user, { fields: [mealPlanEntry.addedByUserId], references: [user.id] }),
}));

export const shoppingListRelations = relations(shoppingList, ({ one, many }) => ({
  user: one(user, { fields: [shoppingList.userId], references: [user.id] }),
  items: many(shoppingListItem),
}));

export const shoppingListItemRelations = relations(shoppingListItem, ({ one }) => ({
  shoppingList: one(shoppingList, {
    fields: [shoppingListItem.shoppingListId],
    references: [shoppingList.id],
  }),
  ingredient: one(ingredient, {
    fields: [shoppingListItem.ingredientId],
    references: [ingredient.id],
  }),
}));

export const importBatchRelations = relations(importBatch, ({ one, many }) => ({
  user: one(user, { fields: [importBatch.userId], references: [user.id] }),
  items: many(importBatchItem),
}));

export const importBatchItemRelations = relations(importBatchItem, ({ one }) => ({
  batch: one(importBatch, { fields: [importBatchItem.batchId], references: [importBatch.id] }),
  recipe: one(recipe, { fields: [importBatchItem.recipeId], references: [recipe.id] }),
}));

export const kitchenStateRelations = relations(kitchenState, ({ one }) => ({
  activeRecipe: one(recipe, {
    fields: [kitchenState.activeRecipeId],
    references: [recipe.id],
  }),
}));
