CREATE TABLE "poll_ceremony_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"active_participant_indices" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_poll_ceremony_session_sequence" UNIQUE("poll_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "poll_ceremony_sessions" ADD CONSTRAINT "fk_poll_ceremony_sessions_poll_id" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;