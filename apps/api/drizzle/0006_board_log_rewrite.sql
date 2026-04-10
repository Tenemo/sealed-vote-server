ALTER TABLE "polls"
    ADD COLUMN IF NOT EXISTS "requested_reconstruction_threshold" integer;--> statement-breakpoint
ALTER TABLE "polls"
    ADD COLUMN IF NOT EXISTS "requested_minimum_published_voter_count" integer;--> statement-breakpoint
ALTER TABLE "polls"
    ADD COLUMN IF NOT EXISTS "protocol_version" text DEFAULT 'v1';--> statement-breakpoint
UPDATE "polls"
SET "protocol_version" = 'v1'
WHERE "protocol_version" IS NULL;--> statement-breakpoint
ALTER TABLE "polls"
    ALTER COLUMN "protocol_version" SET NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "board_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "poll_id" uuid NOT NULL,
    "participant_index" integer NOT NULL,
    "phase" integer NOT NULL,
    "message_type" text NOT NULL,
    "slot_key" text NOT NULL,
    "unsigned_hash" char(64) NOT NULL,
    "previous_entry_hash" char(64),
    "entry_hash" char(64) NOT NULL,
    "signed_payload" jsonb NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_board_messages_poll_id'
    ) THEN
        ALTER TABLE "board_messages"
            ADD CONSTRAINT "fk_board_messages_poll_id"
            FOREIGN KEY ("poll_id")
            REFERENCES "public"."polls"("id")
            ON DELETE cascade;
    END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "unique_board_message_entry_hash"
ON "board_messages" USING btree ("entry_hash");
