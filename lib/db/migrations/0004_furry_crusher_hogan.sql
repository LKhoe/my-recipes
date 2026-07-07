CREATE TABLE "recipe_tip" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"step_index" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_tip" ADD CONSTRAINT "recipe_tip_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tip" ADD CONSTRAINT "recipe_tip_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_tip_recipe_id_idx" ON "recipe_tip" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_tip_user_id_idx" ON "recipe_tip" USING btree ("user_id");