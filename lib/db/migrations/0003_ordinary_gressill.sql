CREATE TABLE "recipe_cook_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"user_id" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_cook_photo" ADD CONSTRAINT "recipe_cook_photo_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_cook_photo" ADD CONSTRAINT "recipe_cook_photo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_cook_photo_recipe_id_idx" ON "recipe_cook_photo" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_cook_photo_user_id_idx" ON "recipe_cook_photo" USING btree ("user_id");