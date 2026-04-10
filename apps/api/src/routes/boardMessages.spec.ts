import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { PollResponse } from '@sealed-vote/contracts';
import type {
    RegistrationPayload,
    SignedPayload,
} from 'threshold-elgamal/protocol';
import { canonicalUnsignedPayloadBytes } from 'threshold-elgamal/protocol';
import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
    signPayloadBytes,
} from 'threshold-elgamal/transport';
import type { FastifyInstance } from 'fastify';

import { buildServer } from '../buildServer';
import {
    closePoll,
    createPoll,
    deletePoll,
    fetchBoardMessages,
    fetchPoll,
    postBoardMessage,
    registerVoter,
} from '../testUtils';

type RegisteredParticipant = {
    voterIndex: number;
    voterName: string;
    voterToken: string;
};

const fixedSessionId = '1'.repeat(64);
const fixedManifestHash = '2'.repeat(64);
const fixedRosterHash = '3'.repeat(64);

const createClosedPollWithParticipants = async (
    fastify: FastifyInstance,
): Promise<{
    creatorToken: string;
    participants: RegisteredParticipant[];
    pollId: string;
}> => {
    const { pollId, creatorToken } = await createPoll(fastify);
    const participants = await Promise.all(
        ['Alice', 'Bob', 'Carla'].map(async (participantName) => {
            const registrationResult = await registerVoter(
                fastify,
                pollId,
                participantName,
            );

            expect(registrationResult.success).toBe(true);
            if (!registrationResult.success) {
                throw new Error(
                    registrationResult.message ?? 'Expected success.',
                );
            }

            return {
                voterIndex: registrationResult.voterIndex,
                voterName: registrationResult.voterName,
                voterToken: registrationResult.voterToken,
            };
        }),
    );

    const closeResult = await closePoll(fastify, pollId, creatorToken);
    expect(closeResult.success).toBe(true);
    if (!closeResult.success) {
        throw new Error(closeResult.message ?? 'Expected success.');
    }

    return {
        creatorToken,
        participants,
        pollId,
    };
};

const createSignedRegistrationPayload = async ({
    participantIndex,
    rosterHash = fixedRosterHash,
}: {
    participantIndex: number;
    rosterHash?: string;
}): Promise<SignedPayload<RegistrationPayload>> => {
    const authKeyPair = await generateAuthKeyPair();
    const transportKeyPair = await generateTransportKeyPair();
    const payload: RegistrationPayload = {
        sessionId: fixedSessionId,
        manifestHash: fixedManifestHash,
        phase: 0,
        participantIndex,
        messageType: 'registration',
        rosterHash,
        authPublicKey: await exportAuthPublicKey(authKeyPair.publicKey),
        transportPublicKey: await exportTransportPublicKey(
            transportKeyPair.publicKey,
        ),
    };

    return {
        payload,
        signature: await signPayloadBytes(
            authKeyPair.privateKey,
            canonicalUnsignedPayloadBytes(payload),
        ),
    };
};

describe('Board messages endpoint', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('classifies exact registration retransmissions as idempotent', async () => {
        const { pollId, creatorToken, participants } =
            await createClosedPollWithParticipants(fastify);
        const participant = participants[0];
        let assertionCount = 0;

        try {
            if (!participant) {
                throw new Error(
                    'Expected at least one registered participant.',
                );
            }

            const signedPayload = await createSignedRegistrationPayload({
                participantIndex: participant.voterIndex,
            });
            const firstPost = await postBoardMessage(fastify, pollId, {
                voterToken: participant.voterToken,
                signedPayload,
            });
            const secondPost = await postBoardMessage(fastify, pollId, {
                voterToken: participant.voterToken,
                signedPayload,
            });

            expect(firstPost.success).toBe(true);
            expect(secondPost.success).toBe(true);
            if (!firstPost.success || !secondPost.success) {
                throw new Error('Expected board messages to be accepted.');
            }
            assertionCount += 2;

            expect(firstPost.record.classification).toBe('accepted');
            expect(secondPost.record.classification).toBe('idempotent');
            assertionCount += 2;

            const boardMessages = await fetchBoardMessages(fastify, pollId);
            expect(boardMessages.messages).toHaveLength(2);
            expect(
                boardMessages.messages.map((message) => message.classification),
            ).toEqual(['accepted', 'idempotent']);
            assertionCount += 2;

            const poll = await fetchPoll(fastify, pollId);
            expect(poll.phase).toBe('setup');
            expect(poll.boardAudit.acceptedCount).toBe(1);
            expect(poll.boardAudit.duplicateCount).toBe(1);
            expect(poll.boardAudit.equivocationCount).toBe(0);
            expect(poll.boardAudit.ceremonyDigest).not.toBeNull();
            expect(poll.boardEntries).toHaveLength(2);
            assertionCount += 6;
        } finally {
            const deleteResult = await deletePoll(
                fastify,
                pollId,
                creatorToken,
            );
            expect(deleteResult.success).toBe(true);
            assertionCount += 1;
            expect(assertionCount).toBeGreaterThan(0);
        }
    });

    test('flags conflicting registration payloads in the same slot as equivocation', async () => {
        const { pollId, creatorToken, participants } =
            await createClosedPollWithParticipants(fastify);
        const participant = participants[0];
        let assertionCount = 0;

        try {
            if (!participant) {
                throw new Error(
                    'Expected at least one registered participant.',
                );
            }

            const firstPayload = await createSignedRegistrationPayload({
                participantIndex: participant.voterIndex,
                rosterHash: fixedRosterHash,
            });
            const conflictingPayload = await createSignedRegistrationPayload({
                participantIndex: participant.voterIndex,
                rosterHash: '4'.repeat(64),
            });

            const firstPost = await postBoardMessage(fastify, pollId, {
                voterToken: participant.voterToken,
                signedPayload: firstPayload,
            });
            const conflictingPost = await postBoardMessage(fastify, pollId, {
                voterToken: participant.voterToken,
                signedPayload: conflictingPayload,
            });

            expect(firstPost.success).toBe(true);
            expect(conflictingPost.success).toBe(true);
            if (!firstPost.success || !conflictingPost.success) {
                throw new Error('Expected board messages to be accepted.');
            }
            assertionCount += 2;

            expect(firstPost.record.classification).toBe('accepted');
            expect(conflictingPost.record.classification).toBe('equivocation');
            assertionCount += 2;

            const poll = (await fetchPoll(fastify, pollId)) as PollResponse;
            expect(poll.boardAudit.acceptedCount).toBe(0);
            expect(poll.boardAudit.duplicateCount).toBe(0);
            expect(poll.boardAudit.equivocationCount).toBe(2);
            expect(poll.boardAudit.ceremonyDigest).toBeNull();
            expect(poll.boardAudit.phaseDigests).toEqual([]);
            expect(
                poll.boardEntries.map((entry) => entry.classification),
            ).toEqual(['equivocation', 'equivocation']);
            assertionCount += 6;
        } finally {
            const deleteResult = await deletePoll(
                fastify,
                pollId,
                creatorToken,
            );
            expect(deleteResult.success).toBe(true);
            assertionCount += 1;
            expect(assertionCount).toBeGreaterThan(0);
        }
    });
});
