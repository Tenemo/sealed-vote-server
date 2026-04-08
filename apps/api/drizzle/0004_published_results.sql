ALTER TABLE "polls"
ADD COLUMN "result_tallies" text[] DEFAULT '{}'::text[] NOT NULL;

ALTER TABLE "polls"
ADD COLUMN "result_scores" double precision[] DEFAULT '{}'::double precision[] NOT NULL;

UPDATE "polls" AS "poll"
SET
    "result_tallies" = ARRAY(
        SELECT "entry"."value"::text
        FROM unnest("poll"."results") WITH ORDINALITY AS "entry"("value", "ord")
        ORDER BY "entry"."ord"
    ),
    "result_scores" = CASE
        WHEN "voter_counts"."voter_count" > 0 THEN ARRAY(
            SELECT round(
                power(
                    "entry"."value"::numeric,
                    1::numeric / "voter_counts"."voter_count"
                )::numeric,
                6
            )::double precision
            FROM unnest("poll"."results") WITH ORDINALITY AS "entry"("value", "ord")
            ORDER BY "entry"."ord"
        )
        ELSE '{}'::double precision[]
    END
FROM (
    SELECT "poll_id", COUNT(*)::numeric AS "voter_count"
    FROM "voters"
    GROUP BY "poll_id"
) AS "voter_counts"
WHERE "poll"."id" = "voter_counts"."poll_id";

ALTER TABLE "polls"
DROP COLUMN "results";
