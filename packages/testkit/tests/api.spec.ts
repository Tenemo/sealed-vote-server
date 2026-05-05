import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { POLL_ROUTES, type BoardMessageRecord } from '@sealed-vote/contracts';
import type { FastifyInstance } from 'fastify';

import { createPoll, postBoardMessage } from '../src/api.ts';

type InjectRequest = {
    method?: string;
    payload?: unknown;
    url?: string;
};

type InjectResponse = {
    body: string;
    statusCode: number;
};

const createFastifyStub = (
    handler: (request: InjectRequest) => Promise<InjectResponse>,
): FastifyInstance =>
    ({
        inject: async (request: InjectRequest): Promise<InjectResponse> =>
            await handler(request),
    }) as unknown as FastifyInstance;

describe('testkit api helpers', () => {
    test('createPoll trims returned names while preserving the create request payload', async () => {
        const requests: InjectRequest[] = [];
        const fastify = createFastifyStub(async (request) => {
            requests.push(request);

            return {
                statusCode: 201,
                body: JSON.stringify({
                    id: 'poll-1',
                    slug: 'lunch-vote--abcd',
                    creatorToken: 'server-token',
                }),
            };
        });

        const createdPoll = await createPoll(fastify, '  Lunch vote  ', [
            ' Pizza ',
            'Sushi',
        ]);

        assert.equal(createdPoll.pollId, 'poll-1');
        assert.equal(createdPoll.pollSlug, 'lunch-vote--abcd');
        assert.equal(createdPoll.pollName, 'Lunch vote');
        assert.deepEqual(createdPoll.choices, ['Pizza', 'Sushi']);
        assert.match(createdPoll.creatorToken, /^[a-f0-9]{64}$/u);
        assert.deepEqual(requests, [
            {
                method: 'POST',
                url: POLL_ROUTES.createPoll,
                payload: {
                    choices: [' Pizza ', 'Sushi'],
                    creatorToken: createdPoll.creatorToken,
                    pollName: '  Lunch vote  ',
                },
            },
        ]);
    });

    test('createPoll uses explicit default choices for omitted choices', async () => {
        const requests: InjectRequest[] = [];
        const fastify = createFastifyStub(async (request) => {
            requests.push(request);

            return {
                statusCode: 201,
                body: JSON.stringify({
                    id: 'poll-2',
                    slug: 'default-choice-poll--abcd',
                    creatorToken: 'server-token',
                }),
            };
        });

        const createdPoll = await createPoll(fastify, 'Default choice poll');

        assert.deepEqual(createdPoll.choices, ['Choice 1', 'Choice 2']);
        assert.deepEqual(
            requests.map((request) => request.payload),
            [
                {
                    choices: ['Choice 1', 'Choice 2'],
                    creatorToken: createdPoll.creatorToken,
                    pollName: 'Default choice poll',
                },
            ],
        );
    });

    test('postBoardMessage returns parsed success and failure shapes', async () => {
        const acceptedRecord = {
            id: 'board-entry-1',
            pollId: 'poll-1',
        } as unknown as BoardMessageRecord;
        const requests: InjectRequest[] = [];
        const fastify = createFastifyStub(async (request) => {
            requests.push(request);

            if (request.payload === 'accepted-payload') {
                return {
                    statusCode: 201,
                    body: JSON.stringify(acceptedRecord),
                };
            }

            return {
                statusCode: 409,
                body: JSON.stringify({
                    message: 'Payload conflicts with an accepted slot.',
                }),
            };
        });

        assert.deepEqual(
            await postBoardMessage(
                fastify,
                'poll-1',
                'accepted-payload' as never,
            ),
            {
                success: true,
                record: acceptedRecord,
            },
        );
        assert.deepEqual(
            await postBoardMessage(fastify, 'poll-1', 'bad-payload' as never),
            {
                success: false,
                message: 'Payload conflicts with an accepted slot.',
            },
        );
        assert.deepEqual(
            requests.map(({ method, url }) => ({ method, url })),
            [
                {
                    method: 'POST',
                    url: POLL_ROUTES.boardMessages('poll-1'),
                },
                {
                    method: 'POST',
                    url: POLL_ROUTES.boardMessages('poll-1'),
                },
            ],
        );
    });
});
