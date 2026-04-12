import type { SignedPayload } from 'threshold-elgamal';

import {
    clearStoredBallotScores,
    createPendingPollDeviceState,
    createPollDeviceState,
    findPollDeviceStateByPollId,
    prunePendingPayloadsForSession,
    savePendingPayloadIfAbsent,
    savePollDeviceState,
} from './pollDeviceStorage';

const createSignedPayload = (signatureSeed: string): SignedPayload =>
    ({
        payload: {
            authPublicKey: 'auth-public-key',
            manifestHash: 'a'.repeat(64),
            messageType: 'registration',
            participantIndex: 1,
            phase: 0,
            rosterHash: 'b'.repeat(64),
            sessionId: 'c'.repeat(64),
            transportPublicKey: 'transport-public-key',
        },
        signature: signatureSeed.repeat(128),
    }) as SignedPayload;

describe('pollDeviceStorage', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('keeps the first pending payload stored for a slot', async () => {
        const pendingState = await createPendingPollDeviceState();
        const deviceState = await createPollDeviceState({
            pendingState,
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            storedBallotScores: [8, 6],
            voterIndex: 1,
            voterName: 'Alice',
            voterToken: 'token-1',
        });
        const firstPayload = createSignedPayload('d');
        const secondPayload = createSignedPayload('e');

        savePollDeviceState(deviceState);

        expect(
            savePendingPayloadIfAbsent({
                pollId: 'poll-1',
                signedPayload: firstPayload,
                slotKey: 'slot-1',
            }),
        ).toEqual(firstPayload);
        expect(
            savePendingPayloadIfAbsent({
                pollId: 'poll-1',
                signedPayload: secondPayload,
                slotKey: 'slot-1',
            }),
        ).toEqual(firstPayload);
        expect(findPollDeviceStateByPollId('poll-1')?.pendingPayloads).toEqual({
            'slot-1': firstPayload,
        });
    });

    it('drops pending payloads from superseded ceremony sessions', async () => {
        const pendingState = await createPendingPollDeviceState();
        const deviceState = await createPollDeviceState({
            pendingState,
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            storedBallotScores: [8, 6],
            voterIndex: 1,
            voterName: 'Alice',
            voterToken: 'token-1',
        });

        savePollDeviceState(deviceState);
        savePendingPayloadIfAbsent({
            pollId: 'poll-1',
            signedPayload: createSignedPayload('d'),
            slotKey: 'old-session:slot-1',
        });
        savePendingPayloadIfAbsent({
            pollId: 'poll-1',
            signedPayload: {
                ...createSignedPayload('e'),
                payload: {
                    ...createSignedPayload('e').payload,
                    sessionId: 'f'.repeat(64),
                },
            } as SignedPayload,
            slotKey: 'new-session:slot-1',
        });

        prunePendingPayloadsForSession({
            pollId: 'poll-1',
            sessionId: 'f'.repeat(64),
        });

        expect(
            Object.values(
                findPollDeviceStateByPollId('poll-1')?.pendingPayloads ?? {},
            ).map((payload) => payload.payload.sessionId),
        ).toEqual(['f'.repeat(64)]);
    });

    it('retains stored ballot scores until the ceremony is explicitly cleared', async () => {
        const pendingState = await createPendingPollDeviceState();
        const deviceState = await createPollDeviceState({
            pendingState,
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            storedBallotScores: [8, 6],
            voterIndex: 1,
            voterName: 'Alice',
            voterToken: 'token-1',
        });

        savePollDeviceState(deviceState);
        expect(
            findPollDeviceStateByPollId('poll-1')?.storedBallotScores,
        ).toEqual([8, 6]);

        clearStoredBallotScores('poll-1');

        expect(findPollDeviceStateByPollId('poll-1')?.storedBallotScores).toBe(
            null,
        );
    });
});
