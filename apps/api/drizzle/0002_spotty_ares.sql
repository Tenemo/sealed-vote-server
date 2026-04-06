ALTER TABLE "polls" DROP CONSTRAINT "unique_poll_name";--> statement-breakpoint
ALTER TABLE "polls" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "unique_poll_slug" UNIQUE("slug");
