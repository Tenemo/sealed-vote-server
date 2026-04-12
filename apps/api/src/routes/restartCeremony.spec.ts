import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
    createRegistrationPayload,
    exportAuthPublicKey,
    exportTransportPublicKey,
} from 'threshold-elgamal';

import { buildServer } from '../buildServer';
import {
    closePoll,
    createPoll,
    deletePoll,
    fetchPoll,
    postBoardMessage,
    registerVoter,
    restartPollCeremony,
} from '../testUtils';

const createBoardRegistrationPayload = async ({
    manifestHash,
    participant,
    rosterHash,
    sessionId,
}: {
    manifestHash: string;
    participant: Awaited<ReturnType<typeof registerVoter>> & { success: true };
    rosterHash: string;
    sessionId: string;
}): Promise<Awaited<ReturnType<typeof createRegistrationPayload>>> =>
    await createRegistrationPayload(participant.authKeyPair.privateKey, {
        authPublicKey: await exportAuthPublicKey(
            participant.authKeyPair.publicKey,
        ),
        manifestHash,
        participantIndex: participant.voterIndex,
        rosterHash,
        sessionId,
        transportPublicKey: await exportTransportPublicKey(
            participant.transportKeyPair.publicKey,
        ),
    });

describe('POST /polls/:pollId/restart-ceremony', () => {
    let fastify: FastifyInstance;

    beforeAll(async () => {
        fastify = await buildServer();
    });

    afterAll(async () => {
        await fastify.close();
    });

    test('restarts the active ceremony session without the currently blocking participant', async () => {
        const { creatorToken, pollId } = await createPoll(fastify);
        const participants = await Promise.all(
            ['Alice', 'Bob', 'Carla', 'Dora'].map(async (voterName) => {
                const registration = await registerVoter(
                    fastify,
                    pollId,
                    voterName,
                );

                expect(registration.success).toBe(true);
                if (!registration.success) {
                    throw new Error(
                        registration.message ?? 'Expected success.',
                    );
                }

                return registration;
            }),
        );

        const closeResult = await closePoll(fastify, pollId, creatorToken);
        expect(closeResult.success).toBe(true);

        const pollBeforeRestart = await fetchPoll(fastify, pollId);
        expect(pollBeforeRestart.sessionId).not.toBeNull();
        expect(pollBeforeRestart.manifestHash).not.toBeNull();
        expect(pollBeforeRestart.manifest).not.toBeNull();

        if (
            !pollBeforeRestart.sessionId ||
            !pollBeforeRestart.manifestHash ||
            !pollBeforeRestart.manifest
        ) {
            throw new Error(
                'Expected a closed poll to expose the initial ceremony session.',
            );
        }

        for (const participant of participants.slice(0, 3)) {
            const registrationPayload = await createBoardRegistrationPayload({
                manifestHash: pollBeforeRestart.manifestHash,
                participant,
                rosterHash: pollBeforeRestart.manifest.rosterHash,
                sessionId: pollBeforeRestart.sessionId,
            });
            const boardPost = await postBoardMessage(fastify, pollId, {
                voterToken: participant.voterToken,
                signedPayload: registrationPayload,
            });

            expect(boardPost.success).toBe(true);
        }

        const restartResult = await restartPollCeremony(
            fastify,
            pollId,
            creatorToken,
        );
        expect(restartResult.success).toBe(true);

        const pollAfterRestart = await fetchPoll(fastify, pollId);
        const skippedParticipant = participants[3];

        if (!skippedParticipant || !skippedParticipant.success) {
            throw new Error('Expected the skipped participant to exist.');
        }

        expect(pollAfterRestart.ceremony.activeParticipantCount).toBe(3);
        expect(pollAfterRestart.ceremony.restartCount).toBe(1);
        expect(pollAfterRestart.voters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    voterIndex: skippedParticipant.voterIndex,
                    ceremonyState: 'skipped',
                }),
            ]),
        );
        expect(pollAfterRestart.sessionId).not.toBe(
            pollBeforeRestart.sessionId,
        );

        await deletePoll(fastify, pollId, creatorToken);
    });

    test('rejects restart when dropping blockers would leave fewer than three active participants', async () => {
        const { creatorToken, pollId } = await createPoll(fastify);
        const participants = await Promise.all(
            ['Alice', 'Bob', 'Carla'].map(async (voterName) => {
                const registration = await registerVoter(
                    fastify,
                    pollId,
                    voterName,
                );

                expect(registration.success).toBe(true);
                if (!registration.success) {
                    throw new Error(
                        registration.message ?? 'Expected success.',
                    );
                }

                return registration;
            }),
        );

        const closeResult = await closePoll(fastify, pollId, creatorToken);
        expect(closeResult.success).toBe(true);

        const pollBeforeRestart = await fetchPoll(fastify, pollId);
        expect(pollBeforeRestart.sessionId).not.toBeNull();
        expect(pollBeforeRestart.manifestHash).not.toBeNull();
        expect(pollBeforeRestart.manifest).not.toBeNull();

        if (
            !pollBeforeRestart.sessionId ||
            !pollBeforeRestart.manifestHash ||
            !pollBeforeRestart.manifest
        ) {
            throw new Error(
                'Expected a closed poll to expose the initial ceremony session.',
            );
        }

        const alice = participants[0];
        if (!alice) {
            throw new Error('Expected Alice to exist.');
        }

        const registrationPayload = await createBoardRegistrationPayload({
            manifestHash: pollBeforeRestart.manifestHash,
            participant: alice,
            rosterHash: pollBeforeRestart.manifest.rosterHash,
            sessionId: pollBeforeRestart.sessionId,
        });
        const boardPost = await postBoardMessage(fastify, pollId, {
            voterToken: alice.voterToken,
            signedPayload: registrationPayload,
        });

        expect(boardPost.success).toBe(true);

        const restartResult = await restartPollCeremony(
            fastify,
            pollId,
            creatorToken,
        );
        expect(restartResult.success).toBe(false);
        expect(restartResult.message).toBe(
            ERROR_MESSAGES.ceremonyRestartMinimumParticipants,
        );

        await deletePoll(fastify, pollId, creatorToken);
    });
});
