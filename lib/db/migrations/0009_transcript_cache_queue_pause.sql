CREATE TABLE "import_queue_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"paused_until" timestamp,
	CONSTRAINT "import_queue_state_singleton_id" CHECK ("import_queue_state"."id" = 'singleton')
);
--> statement-breakpoint
CREATE TABLE "video_transcript" (
	"video_id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
