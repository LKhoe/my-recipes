CREATE TYPE "public"."import_item_status" AS ENUM('pending', 'running', 'done', 'no_recipe', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"tier" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "import_batch_item" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"position" integer NOT NULL,
	"status" "import_item_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"recipe_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN "review_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD COLUMN "is_alternative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_item" ADD CONSTRAINT "import_batch_item_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch_item" ADD CONSTRAINT "import_batch_item_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batch_user_id_idx" ON "import_batch" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_batch_item_batch_id_idx" ON "import_batch_item" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "import_batch_item_status_idx" ON "import_batch_item" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recipe_review_pending_idx" ON "recipe" USING btree ("author_id","review_pending");