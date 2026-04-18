import { randomBytes } from 'node:crypto';

import {
    ERROR_MESSAGES,
    type CreatePollResponse,
    type PollResponse,
} from '@sealed-vote/contracts';
import {
    createPoll,
    deletePoll,
    getUniquePollName,
} from '@sealed-vote/testkit';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../build-server';

const generateToken = (): string => randomBytes(32).toString('hex');

describe('POST /polls/create', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Should create a new poll successfully and then delete it', async () => {
        const pollName = getUniquePollName('Create poll');
        const { pollId, pollSlug, creatorToken } = await createPoll(
            fastify,
            pollName,
            ['Dog', 'Cat'],
        );

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(getResponse.statusCode).toBe(200);
        const pollDetails = JSON.parse(getResponse.body) as PollResponse;
        expect(pollDetails.id).toBe(pollId);
        expect(pollDetails.pollName).toContain(pollName);
        expect(pollDetails.slug).toBe(pollSlug);
        expect(pollDetails.choices).toEqual(['Dog', 'Cat']);

        const deleteResult = await deletePoll(fastify, pollId, creatorToken);
        expect(deleteResult.success).toBe(true);
    });

    test('Should return an error for insufficient choices', async () => {
        const pollName = getUniquePollName('Create poll');
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog'],
                creatorToken: generateToken(),
                pollName,
            },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body) as { message: string };
        expect(responseBody.message).toBe('Not enough choices.');
    });

    test('should reject an invalid creator token format', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Cat'],
                creatorToken: 'short-token',
                pollName: getUniquePollName('Invalid creator token'),
            },
        });

        expect(response.statusCode).toBe(400);
    });

    test('should allow duplicate poll names and generate distinct slugs', async () => {
        const pollName = getUniquePollName('Create poll');
        const firstPoll = await createPoll(fastify, pollName, [
            'Coffee',
            'Tea',
        ]);
        const duplicateCreatorToken = generateToken();
        const duplicateResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Coffee', 'Tea'],
                creatorToken: duplicateCreatorToken,
                pollName,
            },
        });

        expect(duplicateResponse.statusCode).toBe(201);
        const duplicateResponseBody = JSON.parse(
            duplicateResponse.body,
        ) as CreatePollResponse;

        expect(duplicateResponseBody.id).not.toBe(firstPoll.pollId);
        expect(duplicateResponseBody.slug).not.toBe(firstPoll.pollSlug);

        const firstDeleteResult = await deletePoll(
            fastify,
            firstPoll.pollId,
            firstPoll.creatorToken,
        );
        expect(firstDeleteResult.success).toBe(true);

        const secondDeleteResult = await deletePoll(
            fastify,
            duplicateResponseBody.id,
            duplicateResponseBody.creatorToken,
        );
        expect(secondDeleteResult.success).toBe(true);
    });

    test('should trim the poll name and choice names before storing them', async () => {
        const pollName = getUniquePollName('Trimmed create poll');
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['  Dog  ', ' Cat '],
                creatorToken: generateToken(),
                pollName: `  ${pollName}  `,
            },
        });

        expect(response.statusCode).toBe(201);
        const responseBody = JSON.parse(response.body) as CreatePollResponse;
        expect(responseBody.slug).toMatch(/--[0-9a-f]{4}$/);

        const getResponse = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${responseBody.id}`,
        });

        expect(getResponse.statusCode).toBe(200);
        const pollDetails = JSON.parse(getResponse.body) as PollResponse;
        expect(pollDetails.pollName).toBe(pollName);
        expect(pollDetails.choices).toEqual(['Dog', 'Cat']);

        const deleteResult = await deletePoll(
            fastify,
            responseBody.id,
            responseBody.creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('should reject blank poll names after trimming', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Cat'],
                creatorToken: generateToken(),
                pollName: '   ',
            },
        });

        expect(response.statusCode).toBe(400);
        expect((JSON.parse(response.body) as { message: string }).message).toBe(
            'Poll name is required.',
        );
    });

    test('should reject blank or duplicate choice names after trimming', async () => {
        const blankChoiceResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', '   '],
                creatorToken: generateToken(),
                pollName: getUniquePollName('Blank choice poll'),
            },
        });

        expect(blankChoiceResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(blankChoiceResponse.body) as { message: string })
                .message,
        ).toBe('Choice names are required.');

        const duplicateChoiceResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', ' Dog '],
                creatorToken: generateToken(),
                pollName: getUniquePollName('Duplicate trimmed choice poll'),
            },
        });

        expect(duplicateChoiceResponse.statusCode).toBe(400);
        expect(
            (JSON.parse(duplicateChoiceResponse.body) as { message: string })
                .message,
        ).toBe('Choice names must be unique.');
    });

    test('rejects unexpected extra input fields', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Cat'],
                creatorToken: generateToken(),
                unexpectedField: 50,
                pollName: getUniquePollName('Unexpected create field'),
            },
        });

        expect(response.statusCode).toBe(400);
    });

    test('rejects unsupported protocol versions during request validation', async () => {
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Cat'],
                creatorToken: generateToken(),
                pollName: getUniquePollName('Unsupported protocol version'),
                protocolVersion: 'v2',
            },
        });

        expect(response.statusCode).toBe(400);
    });

    test('replays the same create request idempotently for the same creator token', async () => {
        const creatorToken = generateToken();
        const pollName = getUniquePollName('Idempotent create poll');
        const payload = {
            choices: ['Dog', 'Cat'],
            creatorToken,
            pollName,
        };

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload,
        });
        const secondResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload,
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(secondResponse.statusCode).toBe(201);

        const firstBody = JSON.parse(firstResponse.body) as CreatePollResponse;
        const secondBody = JSON.parse(
            secondResponse.body,
        ) as CreatePollResponse;

        expect(secondBody.id).toBe(firstBody.id);
        expect(secondBody.slug).toBe(firstBody.slug);
        expect(secondBody.creatorToken).toBe(creatorToken);

        const deleteResult = await deletePoll(
            fastify,
            firstBody.id,
            creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });

    test('rejects a repeated creator token when the poll payload changes', async () => {
        const creatorToken = generateToken();
        const pollName = getUniquePollName('Conflicting create poll');

        const firstResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Cat'],
                creatorToken,
                pollName,
            },
        });
        const conflictingResponse = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Bird'],
                creatorToken,
                pollName,
            },
        });

        expect(firstResponse.statusCode).toBe(201);
        expect(conflictingResponse.statusCode).toBe(409);
        expect(
            (JSON.parse(conflictingResponse.body) as { message: string })
                .message,
        ).toBe(ERROR_MESSAGES.creatorTokenConflict);

        const createdPoll = JSON.parse(
            firstResponse.body,
        ) as CreatePollResponse;
        const deleteResult = await deletePoll(
            fastify,
            createdPoll.id,
            creatorToken,
        );
        expect(deleteResult.success).toBe(true);
    });
});
