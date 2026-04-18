import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { PollResponse } from '@sealed-vote/contracts';
import {
    closePoll,
    createPoll,
    deletePoll,
    fetchPoll,
    registerVoter,
} from '@sealed-vote/testkit';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';

import { PollResponseSchema } from './fetch';

const clonePoll = (poll: PollResponse): PollResponse => structuredClone(poll);
const uuidPattern =
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

if (!FormatRegistry.Has('uuid')) {
    FormatRegistry.Set('uuid', (value) => uuidPattern.test(value));
}

describe('GET /polls/:pollRef', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('uses integer-valued counts and indices throughout the response contract', async () => {
        const { creatorToken, pollId } = await createPoll(fastify);

        try {
            expect(
                (await registerVoter(fastify, pollId, 'Alice')).success,
            ).toBe(true);
            expect((await registerVoter(fastify, pollId, 'Bob')).success).toBe(
                true,
            );
            expect(
                (await registerVoter(fastify, pollId, 'Carla')).success,
            ).toBe(true);
            expect(
                (await closePoll(fastify, pollId, creatorToken)).success,
            ).toBe(true);

            const poll = await fetchPoll(fastify, pollId);

            expect(Value.Check(PollResponseSchema, poll)).toBe(true);

            const invalidPolls: {
                description: string;
                poll: PollResponse;
            }[] = [
                {
                    description: 'non-uuid poll ids',
                    poll: {
                        ...clonePoll(poll),
                        id: 'not-a-uuid',
                    },
                },
                {
                    description: 'fractional submitted participant counts',
                    poll: {
                        ...clonePoll(poll),
                        submittedParticipantCount: 3.5,
                    },
                },
                {
                    description: 'non-positive close thresholds',
                    poll: {
                        ...clonePoll(poll),
                        minimumCloseParticipantCount: 0,
                    },
                },
                {
                    description: 'negative ceremony counters',
                    poll: {
                        ...clonePoll(poll),
                        ceremony: {
                            ...poll.ceremony,
                            restartCount: -1,
                        },
                    },
                },
                {
                    description: 'fractional board phases',
                    poll: {
                        ...clonePoll(poll),
                        boardAudit: {
                            ...poll.boardAudit,
                            phaseDigests: [
                                {
                                    digest: 'phase-digest',
                                    phase: 0.5,
                                },
                            ],
                        },
                    },
                },
                {
                    description: 'non-integer qual participant indices',
                    poll: {
                        ...clonePoll(poll),
                        verification: {
                            ...poll.verification,
                            qualParticipantIndices: [1.25],
                        },
                    },
                },
                {
                    description: 'fractional tally option indices',
                    poll: {
                        ...clonePoll(poll),
                        verification: {
                            ...poll.verification,
                            verifiedOptionTallies: [
                                {
                                    acceptedBallotCount: 1,
                                    mean: 7.5,
                                    optionIndex: 1.5,
                                    tally: '15',
                                },
                            ],
                        },
                    },
                },
                {
                    description: 'fractional reconstruction thresholds',
                    poll: {
                        ...clonePoll(poll),
                        thresholds: {
                            ...poll.thresholds,
                            reconstructionThreshold: 2.25,
                        },
                    },
                },
            ];

            for (const invalidPoll of invalidPolls) {
                expect(
                    Value.Check(PollResponseSchema, invalidPoll.poll),
                    invalidPoll.description,
                ).toBe(false);
            }
        } finally {
            const deleteResult = await deletePoll(
                fastify,
                pollId,
                creatorToken,
            );
            expect(deleteResult.success).toBe(true);
        }
    });
});
