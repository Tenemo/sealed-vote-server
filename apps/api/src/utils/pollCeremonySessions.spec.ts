import { describe, expect, it } from 'vitest';

import { serializeParticipantDeviceRecord } from './participantDevices.js';
import {
    derivePollCeremonySession,
    normalizeCeremonyParticipantIndices,
    type CeremonyParticipantRow,
} from './pollCeremonySessions.js';

const createTransportPublicKey = (byte: string): string => byte.repeat(64);

const createParticipant = ({
    authPublicKey,
    transportPublicKey,
    voterIndex,
    voterName,
}: {
    authPublicKey?: string;
    transportPublicKey?: string;
    voterIndex: number;
    voterName: string;
}): CeremonyParticipantRow => ({
    id: `voter-${voterIndex}`,
    voterIndex,
    voterName,
    publicKeyShares:
        authPublicKey && transportPublicKey
            ? [
                  {
                      publicKeyShare: serializeParticipantDeviceRecord({
                          authPublicKey,
                          transportPublicKey,
                          transportSuite: 'X25519',
                      }),
                  },
              ]
            : [],
});

describe('pollCeremonySessions', () => {
    it('uses all participants while voting is open and the latest persisted subset once voting is closed', async () => {
        const participants = [
            createParticipant({
                voterIndex: 1,
                voterName: 'Alice',
                authPublicKey: 'auth-1',
                transportPublicKey: createTransportPublicKey('1'),
            }),
            createParticipant({
                voterIndex: 2,
                voterName: 'Bob',
                authPublicKey: 'auth-2',
                transportPublicKey: createTransportPublicKey('2'),
            }),
            createParticipant({
                voterIndex: 3,
                voterName: 'Cora',
                authPublicKey: 'auth-3',
                transportPublicKey: createTransportPublicKey('3'),
            }),
        ];
        const persistedSessions = [
            {
                activeParticipantIndices: [1, 2, 3],
                createdAt: new Date('2026-04-10T10:00:00.000Z'),
                sequence: 1,
            },
            {
                activeParticipantIndices: [3, 1, 3],
                createdAt: new Date('2026-04-11T10:00:00.000Z'),
                sequence: 2,
            },
        ];

        const openSession = await derivePollCeremonySession({
            choices: ['Apples', 'Bananas'],
            isOpen: true,
            participants,
            persistedSessions,
            pollCreatedAt: new Date('2026-04-09T10:00:00.000Z'),
            pollId: 'poll-1',
        });
        const closedSession = await derivePollCeremonySession({
            choices: ['Apples', 'Bananas'],
            isOpen: false,
            participants,
            persistedSessions,
            pollCreatedAt: new Date('2026-04-09T10:00:00.000Z'),
            pollId: 'poll-1',
        });

        expect(openSession.activeParticipantIndices).toEqual([1, 2, 3]);
        expect(openSession.skippedParticipantIndices).toEqual([]);
        expect(openSession.manifest).toBeNull();
        expect(openSession.sessionId).toBeNull();

        expect(closedSession.activeParticipantIndices).toEqual([1, 3]);
        expect(closedSession.skippedParticipantIndices).toEqual([2]);
        expect(closedSession.currentSequence).toBe(2);
        expect(closedSession.restartCount).toBe(1);
        expect(
            closedSession.activeParticipants.map((participant) => ({
                assignedParticipantIndex: participant.assignedParticipantIndex,
                originalParticipantIndex: participant.originalParticipantIndex,
            })),
        ).toEqual([
            {
                assignedParticipantIndex: 1,
                originalParticipantIndex: 1,
            },
            {
                assignedParticipantIndex: 2,
                originalParticipantIndex: 3,
            },
        ]);
        expect(closedSession.manifest).not.toBeNull();
        expect(closedSession.manifestHash).toMatch(/^[a-f0-9]{64}$/i);
        expect(closedSession.rosterHash).toMatch(/^[a-f0-9]{64}$/i);
        expect(closedSession.sessionId).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('falls back to all participants when voting is closed without a persisted session', async () => {
        const participants = [
            createParticipant({
                voterIndex: 2,
                voterName: 'Bob',
                authPublicKey: 'auth-2',
                transportPublicKey: createTransportPublicKey('2'),
            }),
            createParticipant({
                voterIndex: 1,
                voterName: 'Alice',
                authPublicKey: 'auth-1',
                transportPublicKey: createTransportPublicKey('1'),
            }),
        ];

        const session = await derivePollCeremonySession({
            choices: ['Apples'],
            isOpen: false,
            participants,
            persistedSessions: [],
            pollCreatedAt: new Date('2026-04-09T10:00:00.000Z'),
            pollId: 'poll-1',
        });

        expect(session.activeParticipantIndices).toEqual([1, 2]);
        expect(session.currentSequence).toBe(1);
        expect(session.restartCount).toBe(0);
        expect(session.skippedParticipantIndices).toEqual([]);
        expect(session.manifest).not.toBeNull();
        expect(session.sessionId).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('keeps manifest and session identifiers null when any active participant is missing device keys', async () => {
        const session = await derivePollCeremonySession({
            choices: ['Apples'],
            isOpen: false,
            participants: [
                createParticipant({
                    voterIndex: 1,
                    voterName: 'Alice',
                    authPublicKey: 'auth-1',
                    transportPublicKey: createTransportPublicKey('1'),
                }),
                createParticipant({
                    voterIndex: 2,
                    voterName: 'Bob',
                }),
            ],
            persistedSessions: [
                {
                    activeParticipantIndices: [1, 2],
                    createdAt: new Date('2026-04-10T10:00:00.000Z'),
                    sequence: 1,
                },
            ],
            pollCreatedAt: new Date('2026-04-09T10:00:00.000Z'),
            pollId: 'poll-1',
        });

        expect(
            session.activeParticipants.map((participant) => ({
                originalParticipantIndex: participant.originalParticipantIndex,
                deviceReady: participant.deviceReady,
            })),
        ).toEqual([
            {
                originalParticipantIndex: 1,
                deviceReady: true,
            },
            {
                originalParticipantIndex: 2,
                deviceReady: false,
            },
        ]);
        expect(session.rosterEntries).toHaveLength(1);
        expect(session.rosterHash).toBeNull();
        expect(session.manifest).toBeNull();
        expect(session.manifestHash).toBeNull();
        expect(session.sessionId).toBeNull();
    });

    it('normalizes participant indices by dropping invalid values, deduplicating, and sorting', () => {
        expect(
            normalizeCeremonyParticipantIndices([3, 0, 2, 3, -1, 1.5, 1, NaN]),
        ).toEqual([1, 2, 3]);
    });
});
