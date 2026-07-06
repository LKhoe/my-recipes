CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "ingredient_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "invite_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_by_user_id" text,
	"used_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp,
	CONSTRAINT "invite_code_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kitchen_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"active_recipe_id" text,
	"servings_override" integer,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"recipe_id" text NOT NULL,
	"added_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "note_user_recipe_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "rating" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rating_user_recipe_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"servings" integer,
	"prep_time" integer,
	"cook_time" integer,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"video_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "recipe_category" (
	"recipe_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "recipe_category_unique" UNIQUE("recipe_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_image" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"path" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" numeric(10, 3),
	"unit" text,
	"note" text,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_tag" (
	"recipe_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "recipe_tag_unique" UNIQUE("recipe_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shopping_list" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_item" (
	"id" text PRIMARY KEY NOT NULL,
	"shopping_list_id" text NOT NULL,
	"ingredient_id" text,
	"custom_name" text,
	"quantity" numeric(10, 3),
	"unit" text,
	"checked" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tag_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code" ADD CONSTRAINT "invite_code_used_by_user_id_user_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_state" ADD CONSTRAINT "kitchen_state_active_recipe_id_recipe_id_fk" FOREIGN KEY ("active_recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entry" ADD CONSTRAINT "meal_plan_entry_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entry" ADD CONSTRAINT "meal_plan_entry_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating" ADD CONSTRAINT "rating_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_category" ADD CONSTRAINT "recipe_category_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_category" ADD CONSTRAINT "recipe_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_image" ADD CONSTRAINT "recipe_image_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tag" ADD CONSTRAINT "recipe_tag_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tag" ADD CONSTRAINT "recipe_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_shopping_list_id_shopping_list_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_name_idx" ON "ingredient" USING btree ("name");--> statement-breakpoint
CREATE INDEX "invite_code_code_idx" ON "invite_code" USING btree ("code");--> statement-breakpoint
CREATE INDEX "meal_plan_entry_date_idx" ON "meal_plan_entry" USING btree ("date");--> statement-breakpoint
CREATE INDEX "meal_plan_entry_recipe_id_idx" ON "meal_plan_entry" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "note_recipe_id_idx" ON "note" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "rating_recipe_id_idx" ON "rating" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_author_id_idx" ON "recipe" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "recipe_title_idx" ON "recipe" USING btree ("title");--> statement-breakpoint
CREATE INDEX "recipe_deleted_at_idx" ON "recipe" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "recipe_category_category_id_idx" ON "recipe_category" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "recipe_image_recipe_id_idx" ON "recipe_image" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredient_recipe_id_idx" ON "recipe_ingredient" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredient_ingredient_id_idx" ON "recipe_ingredient" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "recipe_tag_tag_id_idx" ON "recipe_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "shopping_list_user_id_idx" ON "shopping_list" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_list_item_shopping_list_id_idx" ON "shopping_list_item" USING btree ("shopping_list_id");--> statement-breakpoint
CREATE INDEX "shopping_list_item_ingredient_id_idx" ON "shopping_list_item" USING btree ("ingredient_id");