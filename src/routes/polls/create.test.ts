/* eslint-disable @typescript-eslint/no-explicit-any */
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../buildServer';

const uniquePollName = (baseName: string): string =>
    `${baseName}-${Date.now()}`;

describe('CreatePoll Endpoint', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('Should create a new poll successfully', async () => {
        const pollName = uniquePollName('Favorite pet'); // Generate unique name
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog', 'Cat'],
                pollName,
            },
        });

        expect(response.statusCode).toBe(200);
        const responseBody = JSON.parse(response.body) as {
            pollName: string;
            choices: string[];
            maxParticipants: number;
            publicKeyShares: string[];
            commonPublicKey: string | null;
            encryptedVotes: any[];
            encryptedTallies: any[];
            decryptionShares: any[];
            results: any[];
        };

        expect(responseBody.pollName).toBe(pollName);
        expect(responseBody.choices).toEqual(['Dog', 'Cat']);
        expect(responseBody.maxParticipants).toBe(20); // default value
        expect(responseBody.publicKeyShares).toEqual([]);
        expect(responseBody.commonPublicKey).toBeNull();
        expect(responseBody.encryptedVotes).toEqual([]);
        expect(responseBody.encryptedTallies).toEqual([]);
        expect(responseBody.decryptionShares).toEqual([]);
        expect(responseBody.results).toEqual([]);
    });

    test('Should return an error for insufficient choices', async () => {
        const pollName = uniquePollName('Insufficient choices');
        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Dog'],
                pollName,
            },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body) as { message: string };
        expect(responseBody.message).toBe('Not enough choices.');
    });

    test('Should handle duplicate poll names', async () => {
        const pollName = uniquePollName('Favorite beverage');
        await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Coffee', 'Tea'],
                pollName,
            },
        });

        const response = await fastify.inject({
            method: 'POST',
            url: '/api/polls/create',
            payload: {
                choices: ['Coffee', 'Tea'],
                pollName,
            },
        });

        expect(response.statusCode).toBe(400);
        const responseBody = JSON.parse(response.body) as { message: string };
        expect(responseBody.message).toBe(
            'Vote with that name already exists.',
        );
    });
});
