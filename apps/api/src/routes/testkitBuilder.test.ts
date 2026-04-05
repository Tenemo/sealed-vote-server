import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import { TestPollBuilder } from '../testUtils';

describe('shared testkit builder', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('completes the full encrypted voting flow with deterministic plaintext results', async () => {
        const completedPoll = await new TestPollBuilder(fastify)
            .withPollName(`Builder flow ${Date.now()}`)
            .withChoices(['Apples', 'Bananas'])
            .withVoters(['Alice', 'Bob'])
            .withScoreMatrix({
                Alice: {
                    Apples: 2,
                    Bananas: 5,
                },
                Bob: {
                    Apples: 7,
                    Bananas: 3,
                },
            })
            .complete();

        expect(completedPoll.poll).not.toBeNull();
        expect(completedPoll.poll?.results).toEqual([14, 15]);
        expect(completedPoll.poll?.voters).toEqual(['Alice', 'Bob']);
    });
});
