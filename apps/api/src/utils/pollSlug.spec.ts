import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { createPoll, deletePoll, getUniquePollName } from '../testUtils';

import {
    assignPollSlugs,
    backfillMissingPollSlugs,
    createPollSlug,
    getCreatePollSlugAttempts,
    toPollSlugTitleSegment,
} from './pollSlug';

describe('pollSlug utilities', () => {
    test('slugifies ascii, unicode, punctuation-heavy, blank, and long titles', () => {
        expect(toPollSlugTitleSegment('Best fruit')).toBe('best-fruit');
        expect(toPollSlugTitleSegment('Déjà Vu!')).toBe('deja-vu');
        expect(toPollSlugTitleSegment('Dogs, cats, and... goats?!')).toBe(
            'dogs-cats-and-goats',
        );
        expect(toPollSlugTitleSegment('   !!!   ')).toBe('vote');

        const longTitleSegment = toPollSlugTitleSegment(
            'This title is definitely longer than thirty-two characters.',
        );
        expect(longTitleSegment.length).toBeLessThanOrEqual(32);
        expect(longTitleSegment.startsWith('-')).toBe(false);
        expect(longTitleSegment.endsWith('-')).toBe(false);
    });

    test('builds canonical slugs from title plus id suffix', () => {
        expect(
            createPollSlug(
                'Best fruit',
                '11111111-1111-4111-8111-abcdefabcdef',
                4,
            ),
        ).toBe('best-fruit--cdef');
    });

    test('escalates to longer id suffixes when shorter slug candidates collide', () => {
        const slugAssignments = assignPollSlugs([
            {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-1111aaaa2222',
                pollName: 'Same title',
            },
            {
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-4444cccc2222',
                pollName: 'Same title',
            },
        ]);

        expect(slugAssignments).toEqual([
            {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-1111aaaa2222',
                slug: 'same-title--2222',
            },
            {
                id: 'bbbbbbbb-bbbb-4bbb-8bbb-4444cccc2222',
                slug: 'same-title--cccc2222',
            },
        ]);
    });

    test('retries fresh four-character slugs before falling back to longer suffixes', () => {
        const generatedIds = [
            'aaaaaaaa-aaaa-4aaa-8aaa-111111111111',
            'bbbbbbbb-bbbb-4bbb-8bbb-222222222222',
            'cccccccc-cccc-4ccc-8ccc-333344445555',
        ];
        const slugAttempts = getCreatePollSlugAttempts(
            'Same title',
            () => generatedIds.shift()!,
            3,
        );

        expect(slugAttempts[0]).toEqual({
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-111111111111',
            slug: 'same-title--1111',
        });
        expect(slugAttempts[1]).toEqual({
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-222222222222',
            slug: 'same-title--2222',
        });
        expect(slugAttempts[2]).toEqual({
            id: 'cccccccc-cccc-4ccc-8ccc-333344445555',
            slug: 'same-title--5555',
        });
        expect(slugAttempts[3]).toEqual({
            id: 'cccccccc-cccc-4ccc-8ccc-333344445555',
            slug: 'same-title--44445555',
        });
        expect(generatedIds).toEqual([]);
    });
});

describe('poll slug backfill', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('backfills missing slugs deterministically and restores the not-null invariant', async () => {
        const pollName = getUniquePollName('Legacy duplicate title');
        const firstPoll = await createPoll(fastify, pollName, [
            'Option 1',
            'Option 2',
        ]);
        const secondPoll = await createPoll(fastify, pollName, [
            'Option 1',
            'Option 2',
        ]);

        await fastify.pgPool.query(
            'ALTER TABLE polls ALTER COLUMN slug DROP NOT NULL',
        );
        await fastify.pgPool.query(
            'UPDATE polls SET slug = NULL WHERE id = ANY($1::uuid[])',
            [[firstPoll.pollId, secondPoll.pollId]],
        );

        await backfillMissingPollSlugs(fastify.pgPool);

        const slugRows = await fastify.pgPool.query<{
            id: string;
            slug: string;
        }>(
            [
                'SELECT id, slug',
                'FROM polls',
                'WHERE id = ANY($1::uuid[])',
                'ORDER BY created_at ASC, id ASC',
            ].join('\n'),
            [[firstPoll.pollId, secondPoll.pollId]],
        );
        const slugColumn = await fastify.pgPool.query<{ is_nullable: string }>(
            [
                'SELECT is_nullable',
                'FROM information_schema.columns',
                "WHERE table_name = 'polls'",
                "AND column_name = 'slug'",
            ].join('\n'),
        );

        expect(slugRows.rows).toHaveLength(2);
        expect(new Set(slugRows.rows.map(({ slug }) => slug)).size).toBe(2);
        expect(slugRows.rows.every(({ slug }) => slug.includes('--'))).toBe(
            true,
        );
        expect(slugColumn.rows[0]?.is_nullable).toBe('NO');

        const firstDeleteResult = await deletePoll(
            fastify,
            firstPoll.pollId,
            firstPoll.creatorToken,
        );
        expect(firstDeleteResult.success).toBe(true);

        const secondDeleteResult = await deletePoll(
            fastify,
            secondPoll.pollId,
            secondPoll.creatorToken,
        );
        expect(secondDeleteResult.success).toBe(true);
    });
});
