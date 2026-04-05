CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"choice_name" text NOT NULL,
	"poll_id" uuid NOT NULL,
	"index" integer NOT NULL,
	CONSTRAINT "unique_choice_name_per_poll" UNIQUE("poll_id","choice_name"),
	CONSTRAINT "unique_choice_index_per_poll" UNIQUE("poll_id","index")
);
--> statement-breakpoint
CREATE TABLE "decryption_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shares" jsonb NOT NULL,
	"poll_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	CONSTRAINT "unique_decryption_shares_per_voter" UNIQUE("poll_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "encrypted_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"votes" jsonb NOT NULL,
	"poll_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	CONSTRAINT "unique_vote_per_voter" UNIQUE("poll_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_name" text NOT NULL,
	"creator_token" char(64) NOT NULL,
	"max_participants" integer DEFAULT 20 NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"common_public_key" text,
	"encrypted_tallies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_poll_name" UNIQUE("poll_name"),
	CONSTRAINT "polls_max_participants_check" CHECK ("polls"."max_participants" >= 2)
);
--> statement-breakpoint
CREATE TABLE "public_key_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"public_key_share" text NOT NULL,
	CONSTRAINT "unique_public_key_share_per_voter" UNIQUE("poll_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "voters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voter_name" text NOT NULL,
	"voter_index" integer NOT NULL,
	"poll_id" uuid NOT NULL,
	"voter_token_hash" char(64) NOT NULL,
	"has_submitted_public_key_share" boolean DEFAULT false NOT NULL,
	"has_voted" boolean DEFAULT false NOT NULL,
	"has_submitted_decryption_shares" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_voter_name_per_poll" UNIQUE("poll_id","voter_name"),
	CONSTRAINT "unique_voter_index_per_poll" UNIQUE("poll_id","voter_index"),
	CONSTRAINT "unique_voter_token_hash_per_poll" UNIQUE("poll_id","voter_token_hash")
);
--> statement-breakpoint
ALTER TABLE "choices" ADD CONSTRAINT "fk_choices_poll_id" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decryption_shares" ADD CONSTRAINT "fk_decryption_shares_poll_id" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decryption_shares" ADD CONSTRAINT "fk_decryption_shares_voter_id" FOREIGN KEY ("voter_id") REFERENCES "public"."voters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_votes" ADD CONSTRAINT "fk_encrypted_votes_poll_id" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encrypted_votes" ADD CONSTRAINT "fk_encrypted_votes_voter_id" FOREIGN KEY ("voter_id") REFERENCES "public"."voters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_key_shares" ADD CONSTRAINT "fk_public_key_shares_poll_id" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_key_shares" ADD CONSTRAINT "fk_public_key_shares_voter_id" FOREIGN KEY ("voter_id") REFERENCES "public"."voters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voters" ADD CONSTRAINT "fk_voters_poll_id" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;
