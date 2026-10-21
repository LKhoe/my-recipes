CREATE TABLE "youtube_playlist" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"playlist_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"refreshed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_playlist_user_playlist_unique" UNIQUE("user_id","playlist_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_playlist_video" (
	"playlist_id" text NOT NULL,
	"video_id" text NOT NULL,
	"title" text NOT NULL,
	"thumbnail_url" text,
	"position" integer NOT NULL,
	"ignored" boolean DEFAULT false NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_playlist_video_unique" UNIQUE("playlist_id","video_id")
);
--> statement-breakpoint
ALTER TABLE "youtube_playlist" ADD CONSTRAINT "youtube_playlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_playlist_video" ADD CONSTRAINT "youtube_playlist_video_playlist_id_youtube_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."youtube_playlist"("id") ON DELETE cascade ON UPDATE no action;