import {
    POLL_SLUG_DELIMITER,
    POLL_SLUG_SUFFIX_LENGTHS,
    POLL_SLUG_TITLE_MAX_LENGTH,
} from '@sealed-vote/contracts';
import slugify from '@sindresorhus/slugify';
import type { Pool } from 'pg';

type PollSlugSource = {
    id: string;
    pollName: string;
};

type PollSlugAssignment = {
    id: string;
    slug: string;
};

const fallbackTitleSegment = 'vote';
const defaultCanonicalPollSlugRetryCount = 8;

const trimHyphens = (value: string): string => value.replace(/^-+|-+$/g, '');

const toSlugIdentifier = (pollId: string): string => pollId.replace(/-/g, '');

export const toPollSlugTitleSegment = (pollName: string): string => {
    const slugifiedTitle = slugify(pollName);
    const truncatedTitle = trimHyphens(
        slugifiedTitle.slice(0, POLL_SLUG_TITLE_MAX_LENGTH),
    );

    return truncatedTitle || fallbackTitleSegment;
};

export const createPollSlug = (
    pollName: string,
    pollId: string,
    suffixLength: number = POLL_SLUG_SUFFIX_LENGTHS[0],
): string =>
    `${toPollSlugTitleSegment(pollName)}${POLL_SLUG_DELIMITER}${toSlugIdentifier(pollId).slice(-suffixLength)}`;

const getPollSlugCandidates = (pollName: string, pollId: string): string[] =>
    POLL_SLUG_SUFFIX_LENGTHS.map((suffixLength) =>
        createPollSlug(pollName, pollId, suffixLength),
    );

export const getCreatePollSlugAttempts = (
    pollName: string,
    createPollId: () => string,
    canonicalPollSlugRetryCount: number = defaultCanonicalPollSlugRetryCount,
): PollSlugAssignment[] => {
    const canonicalAttemptCount =
        Number.isInteger(canonicalPollSlugRetryCount) &&
        canonicalPollSlugRetryCount > 0
            ? canonicalPollSlugRetryCount
            : defaultCanonicalPollSlugRetryCount;
    const canonicalAttempts = Array.from(
        { length: canonicalAttemptCount },
        () => {
            const pollId = createPollId();
            return {
                id: pollId,
                slug: createPollSlug(
                    pollName,
                    pollId,
                    POLL_SLUG_SUFFIX_LENGTHS[0],
                ),
            };
        },
    );
    const fallbackPollId = createPollId();

    return [
        ...canonicalAttempts,
        ...getPollSlugCandidates(pollName, fallbackPollId).map((slug) => ({
            id: fallbackPollId,
            slug,
        })),
    ];
};

export const assignPollSlugs = (
    polls: PollSlugSource[],
    existingSlugs: Iterable<string> = [],
): PollSlugAssignment[] => {
    const occupiedSlugs = new Set(existingSlugs);

    return polls.map(({ id, pollName }) => {
        const slug = getPollSlugCandidates(pollName, id).find((candidate) => {
            if (occupiedSlugs.has(candidate)) {
                return false;
            }

            occupiedSlugs.add(candidate);
            return true;
        });

        if (!slug) {
            throw new Error(`Unable to generate a unique poll slug for ${id}.`);
        }

        return {
            id,
            slug,
        };
    });
};

export const backfillMissingPollSlugs = async (pgPool: Pool): Promise<void> => {
    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');
        await client.query('LOCK TABLE polls IN ACCESS EXCLUSIVE MODE');

        const existingSlugRows = await client.query<{ slug: string }>(
            'SELECT slug FROM polls WHERE slug IS NOT NULL',
        );
        const missingSlugRows = await client.query<PollSlugSource>(
            [
                'SELECT id, poll_name AS "pollName"',
                'FROM polls',
                'WHERE slug IS NULL',
                'ORDER BY created_at ASC, id ASC',
            ].join('\n'),
        );

        const slugAssignments = assignPollSlugs(
            missingSlugRows.rows,
            existingSlugRows.rows.map(({ slug }) => slug),
        );

        for (const { id, slug } of slugAssignments) {
            await client.query('UPDATE polls SET slug = $1 WHERE id = $2', [
                slug,
                id,
            ]);
        }

        await client.query('ALTER TABLE polls ALTER COLUMN slug SET NOT NULL');
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
