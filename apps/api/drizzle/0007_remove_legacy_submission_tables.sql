ALTER TABLE "polls" DROP COLUMN IF EXISTS "common_public_key";
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN IF EXISTS "encrypted_tallies";
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN IF EXISTS "result_tallies";
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN IF EXISTS "result_scores";
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN IF EXISTS "requested_reconstruction_threshold";
--> statement-breakpoint
ALTER TABLE "polls" DROP COLUMN IF EXISTS "requested_minimum_published_voter_count";
--> statement-breakpoint
DROP TABLE IF EXISTS "decryption_shares";
--> statement-breakpoint
DROP TABLE IF EXISTS "encrypted_votes";
