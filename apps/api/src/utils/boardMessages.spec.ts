import { describe, expect, test } from 'vitest';
import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
    type RegistrationPayload,
    type SignedPayload,
} from 'threshold-elgamal';

import {
    boardMessageSlotKey,
    classifyBoardMessages,
    nextEntryHash,
    unsignedPayloadHash,
    type BoardMessageRow,
} from './boardMessages.js';

const fixedPollId = '11111111-1111-1111-1111-111111111111';
const fixedSessionId = '1'.repeat(64);
const fixedManifestHash = '2'.repeat(64);
const fixedCreatedAt = new Date('2026-04-12T00:00:00.000Z');

type RegistrationKeyMaterial = {
    authPublicKey: Awaited<ReturnType<typeof exportAuthPublicKey>>;
    transportPublicKey: Awaited<ReturnType<typeof exportTransportPublicKey>>;
};

const createRegistrationKeyMaterial =
    async (): Promise<RegistrationKeyMaterial> => {
        const authKeyPair = await generateAuthKeyPair();
        const transportKeyPair = await generateTransportKeyPair();

        if (transportKeyPair.suite !== 'X25519') {
            throw new Error(
                `Expected an X25519 transport key pair, received ${transportKeyPair.suite}.`,
            );
        }

        return {
            authPublicKey: await exportAuthPublicKey(authKeyPair.publicKey),
            transportPublicKey: await exportTransportPublicKey(
                transportKeyPair.publicKey,
            ),
        };
    };

const createSignedRegistrationPayload = async ({
    keyMaterial,
    participantIndex,
    rosterHash,
    signature,
}: {
    keyMaterial: RegistrationKeyMaterial;
    participantIndex: number;
    rosterHash: string;
    signature: string;
}): Promise<SignedPayload<RegistrationPayload>> => {
    return {
        payload: {
            authPublicKey: keyMaterial.authPublicKey,
            manifestHash: fixedManifestHash,
            messageType: 'registration',
            participantIndex,
            phase: 0,
            rosterHash,
            sessionId: fixedSessionId,
            transportPublicKey: keyMaterial.transportPublicKey,
        },
        signature,
    };
};

const createBoardMessageRow = ({
    createdAt = fixedCreatedAt,
    id,
    previousEntryHash = null,
    signedPayload,
}: {
    createdAt?: Date;
    id: string;
    previousEntryHash?: string | null;
    signedPayload: SignedPayload<RegistrationPayload>;
}): BoardMessageRow => ({
    createdAt,
    entryHash: nextEntryHash(previousEntryHash, signedPayload),
    id,
    messageType: signedPayload.payload.messageType,
    participantIndex: signedPayload.payload.participantIndex,
    phase: signedPayload.payload.phase,
    pollId: fixedPollId,
    previousEntryHash,
    signedPayload,
    slotKey: boardMessageSlotKey(signedPayload),
    unsignedHash: unsignedPayloadHash(signedPayload),
});

describe('boardMessages', () => {
    test('classifies repeated payloads with the same unsigned hash as idempotent duplicates', async () => {
        const keyMaterial = await createRegistrationKeyMaterial();
        const firstPayload = await createSignedRegistrationPayload({
            keyMaterial,
            participantIndex: 1,
            rosterHash: '3'.repeat(64),
            signature: 'aa',
        });
        const duplicatePayload = await createSignedRegistrationPayload({
            keyMaterial,
            participantIndex: 1,
            rosterHash: '3'.repeat(64),
            signature: 'bb',
        });
        const firstRow = createBoardMessageRow({
            id: 'row-1',
            signedPayload: firstPayload,
        });
        const duplicateRow = createBoardMessageRow({
            createdAt: new Date('2026-04-12T00:00:01.000Z'),
            id: 'row-2',
            previousEntryHash: firstRow.entryHash,
            signedPayload: duplicatePayload,
        });

        const classified = await classifyBoardMessages([
            firstRow,
            duplicateRow,
        ]);

        expect(classified.acceptedPayloads).toEqual([firstPayload]);
        expect(
            classified.records.map((record) => record.classification),
        ).toEqual(['accepted', 'idempotent']);
        expect(classified.boardAudit).toMatchObject({
            acceptedCount: 1,
            duplicateCount: 1,
            equivocationCount: 0,
        });
        expect(classified.boardAudit.ceremonyDigest).toMatch(/^[a-f0-9]{64}$/i);
        expect(classified.boardAudit.phaseDigests).toEqual([
            {
                phase: 0,
                digest: expect.stringMatching(/^[a-f0-9]{64}$/i),
            },
        ]);
    });

    test('suppresses ceremony digests when any slot equivocates', async () => {
        const participantOneKeys = await createRegistrationKeyMaterial();
        const participantTwoKeys = await createRegistrationKeyMaterial();
        const acceptedPayload = await createSignedRegistrationPayload({
            keyMaterial: participantTwoKeys,
            participantIndex: 2,
            rosterHash: '4'.repeat(64),
            signature: 'cc',
        });
        const firstEquivocatingPayload = await createSignedRegistrationPayload({
            keyMaterial: participantOneKeys,
            participantIndex: 1,
            rosterHash: '5'.repeat(64),
            signature: 'dd',
        });
        const conflictingPayload = await createSignedRegistrationPayload({
            keyMaterial: participantOneKeys,
            participantIndex: 1,
            rosterHash: '6'.repeat(64),
            signature: 'ee',
        });
        const acceptedRow = createBoardMessageRow({
            createdAt: new Date('2026-04-12T00:00:02.000Z'),
            id: 'row-3',
            signedPayload: acceptedPayload,
        });
        const firstEquivocatingRow = createBoardMessageRow({
            id: 'row-1',
            signedPayload: firstEquivocatingPayload,
        });
        const conflictingRow = createBoardMessageRow({
            createdAt: new Date('2026-04-12T00:00:01.000Z'),
            id: 'row-2',
            previousEntryHash: firstEquivocatingRow.entryHash,
            signedPayload: conflictingPayload,
        });

        const classified = await classifyBoardMessages([
            acceptedRow,
            firstEquivocatingRow,
            conflictingRow,
        ]);

        expect(classified.acceptedPayloads).toEqual([acceptedPayload]);
        expect(
            classified.records.map((record) => record.classification),
        ).toEqual(['equivocation', 'equivocation', 'accepted']);
        expect(classified.boardAudit).toEqual({
            acceptedCount: 1,
            duplicateCount: 0,
            equivocationCount: 2,
            ceremonyDigest: null,
            phaseDigests: [],
        });
    });
});
