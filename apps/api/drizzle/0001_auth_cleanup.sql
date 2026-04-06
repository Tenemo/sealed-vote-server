ALTER TABLE "polls" ADD COLUMN "creator_token_hash" char(64);
--> statement-breakpoint
UPDATE "polls"
SET "creator_token_hash" = encode(digest(trim(both from "creator_token"), 'sha256'), 'hex');
--> statement-breakpoint
ALTER TABLE "polls" ALTER COLUMN "creator_token_hash" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN "creator_token";
--> statement-breakpoint
ALTER TABLE "voters" DROP COLUMN "has_submitted_public_key_share";
--> statement-breakpoint
ALTER TABLE "voters" DROP COLUMN "has_voted";
--> statement-breakpoint
ALTER TABLE "voters" DROP COLUMN "has_submitted_decryption_shares";
