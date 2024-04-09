import { FastifyInstance } from 'fastify';
import { buildServer } from '../../buildServer';
import { getUniquePollName } from '../../testUtils';

import { CreatePollResponse } from './create';
import { PollResponse } from './fetch';

describe('Polls Endpoint', () => {
    let fastify: FastifyInstance;
    let pollId: string;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    const createPoll = async (): Promise<string> => {
        const pollName = getUniquePollName('Test Poll');
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Option 1', 'Option 2'],
                pollName,
            },
        });
        const responseBody: CreatePollResponse = JSON.parse(
            response.body,
        ) as CreatePollResponse;
        return responseBody.id;
    };

    test('Create a poll for testing', async () => {
        pollId = await createPoll();
        expect(pollId).toBeTruthy();
    });

    test('Retrieve poll details', async () => {
        const response = await fastify.inject({
            method: 'GET',
            url: `/api/polls/${pollId}`,
        });

        expect(response.statusCode).toBe(200);
        const pollDetails: PollResponse = JSON.parse(
            response.body,
        ) as PollResponse;

        expect(pollDetails).toHaveProperty('pollName');
        expect(pollDetails).toHaveProperty('createdAt');
        expect(pollDetails.choices.length).toBeGreaterThan(0);
        expect(pollDetails.voters).toEqual([]);
        expect(pollDetails.isOpen).toBe(true);
        expect(pollDetails.publicKeyShares).toEqual([]);
        expect(pollDetails.commonPublicKey).toBeNull();
        expect(pollDetails.encryptedVotes).toEqual([]);
        expect(pollDetails.encryptedTallies).toEqual([]);
        expect(pollDetails.decryptionShares).toEqual([]);
        expect(pollDetails.results).toEqual([]);
    });

    // Add more tests as necessary...
});
