import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
    ERROR_MESSAGES,
    POLL_ROUTES,
    type PollResponse,
} from '@sealed-vote/contracts';
import {
    createRegistrationPayload,
    createManifestPublicationPayload,
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateTransportKeyPair,
    type RegistrationPayload,
    type SignedPayload,
} from 'threshold-elgamal';
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
    restartPollCeremony,
} from '../testUtils';

type RegisteredParticipant = {
    authKeyPair: CryptoKeyPair;
    transportKeyPair: Awaited<ReturnType<typeof generateTransportKeyPair>>;
    voterIndex: number;
    voterName: string;
    voterToken: string;
};

const fixedSessionId = '1'.repeat(64);
const fixedManifestHash = '2'.repeat(64);
const fixedRosterHash = '3'.repeat(64);

const createClosedPollWithParticipants = async (
    fastify: FastifyInstance,
    participantNames: readonly string[] = ['Alice', 'Bob', 'Carla'],
): Promise<{
    creatorToken: string;
    participants: RegisteredParticipant[];
    pollId: string;
}> => {
    const { pollId, creatorToken } = await createPoll(fastify);
    const participants = await Promise.all(
        participantNames.map(async (participantName) => {
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
                authKeyPair: registrationResult.authKeyPair,
                transportKeyPair: registrationResult.transportKeyPair,
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
    authKeyPair,
    manifestHash = fixedManifestHash,
    participantIndex,
    rosterHash = fixedRosterHash,
    sessionId = fixedSessionId,
    transportKeyPair,
}: {
    authKeyPair: CryptoKeyPair;
    manifestHash?: string;
    participantIndex: number;
    rosterHash?: string;
    sessionId?: string;
    transportKeyPair: Awaited<ReturnType<typeof generateTransportKeyPair>>;
}): Promise<SignedPayload<RegistrationPayload>> => {
    return await createRegistrationPayload(authKeyPair.privateKey, {
        sessionId,
        manifestHash,
        participantIndex,
        rosterHash,
        authPublicKey: await exportAuthPublicKey(authKeyPair.publicKey),
        transportPublicKey: await exportTransportPublicKey(
            transportKeyPair.publicKey,
        ),
    });
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

            const poll = await fetchPoll(fastify, pollId);

            if (!poll.manifest || !poll.manifestHash || !poll.sessionId) {
                throw new Error(
                    'Expected the closed poll to expose a manifest, manifest hash, and session id.',
                );
            }

            const signedPayload = await createSignedRegistrationPayload({
                authKeyPair: participant.authKeyPair,
                manifestHash: poll.manifestHash,
                participantIndex: participant.voterIndex,
                rosterHash: poll.manifest.rosterHash,
                sessionId: poll.sessionId,
                transportKeyPair: participant.transportKeyPair,
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

            const pollAfterPosts = await fetchPoll(fastify, pollId);
            expect(pollAfterPosts.phase).toBe('securing');
            expect(pollAfterPosts.boardAudit.acceptedCount).toBe(1);
            expect(pollAfterPosts.boardAudit.duplicateCount).toBe(1);
            expect(pollAfterPosts.boardAudit.equivocationCount).toBe(0);
            expect(pollAfterPosts.boardAudit.ceremonyDigest).not.toBeNull();
            expect(pollAfterPosts.boardEntries).toHaveLength(2);
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

    test('rejects conflicting registration payloads that do not match the active ceremony session', async () => {
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

            const pollBeforeConflict = await fetchPoll(fastify, pollId);

            if (
                !pollBeforeConflict.manifest ||
                !pollBeforeConflict.manifestHash ||
                !pollBeforeConflict.sessionId
            ) {
                throw new Error(
                    'Expected the closed poll to expose a manifest, manifest hash, and session id.',
                );
            }

            const firstPayload = await createSignedRegistrationPayload({
                authKeyPair: participant.authKeyPair,
                manifestHash: pollBeforeConflict.manifestHash,
                participantIndex: participant.voterIndex,
                rosterHash: pollBeforeConflict.manifest.rosterHash,
                sessionId: pollBeforeConflict.sessionId,
                transportKeyPair: participant.transportKeyPair,
            });
            const conflictingPayload = await createSignedRegistrationPayload({
                authKeyPair: participant.authKeyPair,
                manifestHash: pollBeforeConflict.manifestHash,
                participantIndex: participant.voterIndex,
                rosterHash: '4'.repeat(64),
                sessionId: pollBeforeConflict.sessionId,
                transportKeyPair: participant.transportKeyPair,
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
            expect(conflictingPost.success).toBe(false);
            if (!firstPost.success || conflictingPost.success) {
                throw new Error(
                    'Expected the valid registration to be accepted and the conflicting one to be rejected.',
                );
            }
            assertionCount += 2;

            expect(firstPost.record.classification).toBe('accepted');
            expect(conflictingPost.message).toBe(
                ERROR_MESSAGES.boardMessageSessionMismatch,
            );
            assertionCount += 2;

            const poll = (await fetchPoll(fastify, pollId)) as PollResponse;
            expect(poll.boardAudit.acceptedCount).toBe(1);
            expect(poll.boardAudit.duplicateCount).toBe(0);
            expect(poll.boardAudit.equivocationCount).toBe(0);
            expect(poll.boardAudit.ceremonyDigest).not.toBeNull();
            expect(
                poll.boardEntries.map((entry) => entry.classification),
            ).toEqual(['accepted']);
            assertionCount += 5;
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

    test('rejects board message fetches with an unknown incremental cursor', async () => {
        const { pollId, creatorToken } =
            await createClosedPollWithParticipants(fastify);
        let assertionCount = 0;

        try {
            const response = await fastify.inject({
                method: 'GET',
                url: `${POLL_ROUTES.boardMessages(pollId)}?afterEntryHash=${'9'.repeat(64)}`,
            });

            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body)).toEqual({
                message: ERROR_MESSAGES.boardMessageCursorInvalid,
            });
            assertionCount += 2;
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

    test('rejects malformed protocol payloads before participant validation', async () => {
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

            const response = await fastify.inject({
                method: 'POST',
                url: POLL_ROUTES.boardMessages(pollId),
                payload: {
                    voterToken: participant.voterToken,
                    signedPayload: {
                        payload: {
                            sessionId: fixedSessionId,
                            manifestHash: fixedManifestHash,
                            phase: 0,
                            participantIndex: participant.voterIndex,
                            messageType: 'registration',
                            rosterHash: fixedRosterHash,
                            transportPublicKey: 'deadbeef',
                        },
                        signature: '00',
                    },
                },
            });

            expect(response.statusCode).toBe(400);
            expect(JSON.parse(response.body)).toEqual({
                message: ERROR_MESSAGES.boardMessagePayloadInvalid,
            });
            assertionCount += 2;
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

    test('accepts manifest publication once the full frozen registration roster is on the board', async () => {
        const { pollId, creatorToken, participants } =
            await createClosedPollWithParticipants(fastify);
        let assertionCount = 0;

        try {
            const pollBeforeManifest = await fetchPoll(fastify, pollId);

            expect(pollBeforeManifest.manifest).not.toBeNull();
            expect(pollBeforeManifest.manifestHash).not.toBeNull();
            expect(pollBeforeManifest.sessionId).not.toBeNull();
            assertionCount += 3;

            if (
                !pollBeforeManifest.manifest ||
                !pollBeforeManifest.manifestHash ||
                !pollBeforeManifest.sessionId
            ) {
                throw new Error(
                    'Expected the closed poll to expose a manifest, manifest hash, and session id.',
                );
            }

            for (const participant of participants) {
                const registrationPayload =
                    await createSignedRegistrationPayload({
                        authKeyPair: participant.authKeyPair,
                        manifestHash: pollBeforeManifest.manifestHash,
                        participantIndex: participant.voterIndex,
                        rosterHash: pollBeforeManifest.manifest.rosterHash,
                        sessionId: pollBeforeManifest.sessionId,
                        transportKeyPair: participant.transportKeyPair,
                    });
                const registrationPost = await postBoardMessage(
                    fastify,
                    pollId,
                    {
                        voterToken: participant.voterToken,
                        signedPayload: registrationPayload,
                    },
                );

                expect(registrationPost.success).toBe(true);
                assertionCount += 1;
            }

            const creatorParticipant = participants[0];
            if (!creatorParticipant) {
                throw new Error(
                    'Expected a creator participant to publish the manifest.',
                );
            }

            const manifestPublication = await createManifestPublicationPayload(
                creatorParticipant.authKeyPair.privateKey,
                {
                    manifest: pollBeforeManifest.manifest,
                    manifestHash: pollBeforeManifest.manifestHash,
                    participantIndex: creatorParticipant.voterIndex,
                    sessionId: pollBeforeManifest.sessionId,
                },
            );
            const manifestPost = await postBoardMessage(fastify, pollId, {
                voterToken: creatorParticipant.voterToken,
                signedPayload: manifestPublication,
            });

            expect(manifestPost.success).toBe(true);
            if (!manifestPost.success) {
                throw new Error(
                    'Expected manifest publication to be accepted.',
                );
            }
            expect(manifestPost.record.classification).toBe('accepted');
            assertionCount += 2;

            const pollAfterManifest = await fetchPoll(fastify, pollId);

            expect(pollAfterManifest.phase).toBe('securing');
            expect(pollAfterManifest.boardAudit.acceptedCount).toBe(4);
            expect(pollAfterManifest.verification.status).toBe('not-ready');
            expect(pollAfterManifest.verification.reason).not.toContain(
                'manifest has not been published',
            );
            assertionCount += 4;
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

    test('rejects board messages from a participant skipped by a ceremony restart', async () => {
        const { pollId, creatorToken, participants } =
            await createClosedPollWithParticipants(fastify, [
                'Alice',
                'Bob',
                'Carla',
                'Dora',
            ]);
        let assertionCount = 0;

        try {
            const pollBeforeRestart = await fetchPoll(fastify, pollId);

            if (
                !pollBeforeRestart.manifest ||
                !pollBeforeRestart.manifestHash ||
                !pollBeforeRestart.sessionId
            ) {
                throw new Error(
                    'Expected the closed poll to expose a manifest, manifest hash, and session id.',
                );
            }

            for (const participant of participants.slice(0, 3)) {
                const registrationPayload =
                    await createSignedRegistrationPayload({
                        authKeyPair: participant.authKeyPair,
                        manifestHash: pollBeforeRestart.manifestHash,
                        participantIndex: participant.voterIndex,
                        rosterHash: pollBeforeRestart.manifest.rosterHash,
                        sessionId: pollBeforeRestart.sessionId,
                        transportKeyPair: participant.transportKeyPair,
                    });
                const registrationPost = await postBoardMessage(
                    fastify,
                    pollId,
                    {
                        voterToken: participant.voterToken,
                        signedPayload: registrationPayload,
                    },
                );

                expect(registrationPost.success).toBe(true);
                assertionCount += 1;
            }

            const restartResult = await restartPollCeremony(
                fastify,
                pollId,
                creatorToken,
            );
            expect(restartResult.success).toBe(true);
            assertionCount += 1;

            const pollAfterRestart = await fetchPoll(fastify, pollId);
            const skippedParticipant = participants[3];

            if (
                !skippedParticipant ||
                !pollAfterRestart.manifest ||
                !pollAfterRestart.manifestHash ||
                !pollAfterRestart.sessionId
            ) {
                throw new Error(
                    'Expected the restarted poll and skipped participant to exist.',
                );
            }

            const skippedPayload = await createSignedRegistrationPayload({
                authKeyPair: skippedParticipant.authKeyPair,
                manifestHash: pollAfterRestart.manifestHash,
                participantIndex: skippedParticipant.voterIndex,
                rosterHash: pollAfterRestart.manifest.rosterHash,
                sessionId: pollAfterRestart.sessionId,
                transportKeyPair: skippedParticipant.transportKeyPair,
            });
            const skippedResponse = await fastify.inject({
                method: 'POST',
                url: POLL_ROUTES.boardMessages(pollId),
                payload: {
                    voterToken: skippedParticipant.voterToken,
                    signedPayload: skippedPayload,
                },
            });

            expect(skippedResponse.statusCode).toBe(403);
            expect(JSON.parse(skippedResponse.body)).toEqual({
                message: ERROR_MESSAGES.boardMessageSkippedParticipant,
            });
            assertionCount += 2;
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

    test('rejects payloads from a superseded ceremony session after restart', async () => {
        const { pollId, creatorToken, participants } =
            await createClosedPollWithParticipants(fastify, [
                'Alice',
                'Bob',
                'Carla',
                'Dora',
            ]);
        let assertionCount = 0;

        try {
            const pollBeforeRestart = await fetchPoll(fastify, pollId);

            if (
                !pollBeforeRestart.manifest ||
                !pollBeforeRestart.manifestHash ||
                !pollBeforeRestart.sessionId
            ) {
                throw new Error(
                    'Expected the closed poll to expose a manifest, manifest hash, and session id.',
                );
            }

            for (const participant of participants.slice(0, 3)) {
                const registrationPayload =
                    await createSignedRegistrationPayload({
                        authKeyPair: participant.authKeyPair,
                        manifestHash: pollBeforeRestart.manifestHash,
                        participantIndex: participant.voterIndex,
                        rosterHash: pollBeforeRestart.manifest.rosterHash,
                        sessionId: pollBeforeRestart.sessionId,
                        transportKeyPair: participant.transportKeyPair,
                    });
                const registrationPost = await postBoardMessage(
                    fastify,
                    pollId,
                    {
                        voterToken: participant.voterToken,
                        signedPayload: registrationPayload,
                    },
                );

                expect(registrationPost.success).toBe(true);
                assertionCount += 1;
            }

            const restartResult = await restartPollCeremony(
                fastify,
                pollId,
                creatorToken,
            );
            expect(restartResult.success).toBe(true);
            assertionCount += 1;

            const activeParticipant = participants[0];
            if (!activeParticipant) {
                throw new Error(
                    'Expected at least one active participant after restart.',
                );
            }

            const stalePayload = await createSignedRegistrationPayload({
                authKeyPair: activeParticipant.authKeyPair,
                manifestHash: pollBeforeRestart.manifestHash,
                participantIndex: activeParticipant.voterIndex,
                rosterHash: pollBeforeRestart.manifest.rosterHash,
                sessionId: pollBeforeRestart.sessionId,
                transportKeyPair: activeParticipant.transportKeyPair,
            });
            const staleResponse = await fastify.inject({
                method: 'POST',
                url: POLL_ROUTES.boardMessages(pollId),
                payload: {
                    voterToken: activeParticipant.voterToken,
                    signedPayload: stalePayload,
                },
            });

            expect(staleResponse.statusCode).toBe(400);
            expect(JSON.parse(staleResponse.body)).toEqual({
                message: ERROR_MESSAGES.boardMessageSessionMismatch,
            });
            assertionCount += 2;
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
