import { describe, expect, test } from 'vitest';
import { sortProtocolPayloads } from '@sealed-vote/protocol';
import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
    hashProtocolTranscript,
    type RegistrationPayload,
    type SignedPayload,
} from 'threshold-elgamal';

import {
    boardMessageSlotKey,
    classifyBoardMessageRow,
    classifyBoardMessages,
    nextEntryHash,
    unsignedPayloadHash,
    type BoardMessageRow,
} from './board-messages.js';

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
            protocolVersion: 'v1',
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
                digest: await hashProtocolTranscript(
                    sortProtocolPayloads([firstPayload.payload]),
                ),
            },
        ]);
    });

    test('breaks identical timestamps by row id so the earliest id is accepted', async () => {
        const keyMaterial = await createRegistrationKeyMaterial();
        const lexicallyFirstPayload = await createSignedRegistrationPayload({
            keyMaterial,
            participantIndex: 1,
            rosterHash: 'a'.repeat(64),
            signature: '12',
        });
        const lexicallyLaterPayload = await createSignedRegistrationPayload({
            keyMaterial,
            participantIndex: 1,
            rosterHash: 'a'.repeat(64),
            signature: '34',
        });
        const lexicallyLaterRow = createBoardMessageRow({
            id: 'row-b',
            signedPayload: lexicallyLaterPayload,
        });
        const lexicallyFirstRow = createBoardMessageRow({
            id: 'row-a',
            signedPayload: lexicallyFirstPayload,
        });

        const classified = await classifyBoardMessages([
            lexicallyLaterRow,
            lexicallyFirstRow,
        ]);

        expect(classified.acceptedPayloads).toEqual([lexicallyFirstPayload]);
        expect(classified.records).toMatchObject([
            {
                id: 'row-a',
                classification: 'accepted',
            },
            {
                id: 'row-b',
                classification: 'idempotent',
            },
        ]);
        expect(classified.boardAudit).toMatchObject({
            acceptedCount: 1,
            duplicateCount: 1,
            equivocationCount: 0,
        });
        expect(classified.boardAudit.phaseDigests).toEqual([
            {
                phase: 0,
                digest: await hashProtocolTranscript(
                    sortProtocolPayloads([lexicallyFirstPayload.payload]),
                ),
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

    test('classifies a slot row by the earliest row even when slot rows are unsorted', async () => {
        const keyMaterial = await createRegistrationKeyMaterial();
        const firstPayload = await createSignedRegistrationPayload({
            keyMaterial,
            participantIndex: 1,
            rosterHash: '7'.repeat(64),
            signature: 'ff',
        });
        const duplicatePayload = await createSignedRegistrationPayload({
            keyMaterial,
            participantIndex: 1,
            rosterHash: '7'.repeat(64),
            signature: '11',
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

        const accepted = classifyBoardMessageRow(firstRow, [
            duplicateRow,
            firstRow,
        ]);
        const duplicate = classifyBoardMessageRow(duplicateRow, [
            duplicateRow,
            firstRow,
        ]);

        expect(accepted.classification).toBe('accepted');
        expect(duplicate.classification).toBe('idempotent');
    });

    test('keeps accepted payloads in board order when that differs from protocol order', async () => {
        const participantOneKeys = await createRegistrationKeyMaterial();
        const participantTwoKeys = await createRegistrationKeyMaterial();
        const participantTwoPayload = await createSignedRegistrationPayload({
            keyMaterial: participantTwoKeys,
            participantIndex: 2,
            rosterHash: '8'.repeat(64),
            signature: '22',
        });
        const participantOnePayload = await createSignedRegistrationPayload({
            keyMaterial: participantOneKeys,
            participantIndex: 1,
            rosterHash: '9'.repeat(64),
            signature: '33',
        });
        const participantTwoRow = createBoardMessageRow({
            createdAt: new Date('2026-04-12T00:00:00.000Z'),
            id: 'row-4',
            signedPayload: participantTwoPayload,
        });
        const participantOneRow = createBoardMessageRow({
            createdAt: new Date('2026-04-12T00:00:01.000Z'),
            id: 'row-5',
            previousEntryHash: participantTwoRow.entryHash,
            signedPayload: participantOnePayload,
        });

        const classified = await classifyBoardMessages([
            participantOneRow,
            participantTwoRow,
        ]);

        expect(
            classified.acceptedPayloads.map(
                (payload) => payload.payload.participantIndex,
            ),
        ).toEqual([2, 1]);
        expect(classified.boardAudit.ceremonyDigest).toMatch(/^[a-f0-9]{64}$/i);
    });
});
