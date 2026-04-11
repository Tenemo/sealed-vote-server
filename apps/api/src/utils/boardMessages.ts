import crypto from 'node:crypto';

import type { BoardMessageRecord } from '@sealed-vote/contracts';
import {
    canonicalUnsignedPayloadBytes,
    protocolPayloadSlotKey,
    sortProtocolPayloads,
} from '@sealed-vote/protocol';
import { and, asc, desc, eq } from 'drizzle-orm';
import { hashProtocolTranscript, type SignedPayload } from 'threshold-elgamal';

import type { Database, DatabaseTransaction } from '../db/client.js';
import { boardMessages } from '../db/schema.js';

import { normalizeDatabaseTimestamp } from './db.js';

type ReadOnlyDatabase = Database | DatabaseTransaction;
export type BoardMessageRow = typeof boardMessages.$inferSelect;

const hashBytes = (value: Uint8Array | string): string =>
    crypto.createHash('sha256').update(value).digest('hex');

export const unsignedPayloadHash = (signedPayload: SignedPayload): string =>
    hashBytes(canonicalUnsignedPayloadBytes(signedPayload.payload));

export const nextEntryHash = (
    previousEntryHash: string | null,
    signedPayload: SignedPayload,
): string =>
    hashBytes(
        JSON.stringify({
            previousEntryHash,
            signature: signedPayload.signature,
            unsignedHash: unsignedPayloadHash(signedPayload),
        }),
    );

const sortBoardRows = (rows: readonly BoardMessageRow[]): BoardMessageRow[] =>
    [...rows].sort((left, right) => {
        const leftTimestamp = normalizeDatabaseTimestamp(left.createdAt);
        const rightTimestamp = normalizeDatabaseTimestamp(right.createdAt);

        if (leftTimestamp < rightTimestamp) {
            return -1;
        }

        if (leftTimestamp > rightTimestamp) {
            return 1;
        }

        return left.id.localeCompare(right.id);
    });

type ClassifiedBoardMessages = {
    acceptedPayloads: SignedPayload[];
    boardAudit: {
        acceptedCount: number;
        duplicateCount: number;
        equivocationCount: number;
        ceremonyDigest: string | null;
        phaseDigests: {
            phase: number;
            digest: string;
        }[];
    };
    records: BoardMessageRecord[];
};

const toBoardMessageRecord = (
    row: BoardMessageRow,
    classification: BoardMessageRecord['classification'],
): BoardMessageRecord => ({
    id: row.id,
    createdAt: normalizeDatabaseTimestamp(row.createdAt),
    phase: row.phase,
    participantIndex: row.participantIndex,
    messageType: row.messageType as BoardMessageRecord['messageType'],
    slotKey: row.slotKey,
    unsignedHash: row.unsignedHash,
    previousEntryHash: row.previousEntryHash,
    entryHash: row.entryHash,
    classification,
    signedPayload: row.signedPayload,
});

const classifySlotRows = (
    slotRows: readonly BoardMessageRow[],
    rowId: string,
): BoardMessageRecord['classification'] => {
    const distinctUnsignedHashCount = new Set(
        slotRows.map((entry) => entry.unsignedHash),
    ).size;

    if (distinctUnsignedHashCount > 1) {
        return 'equivocation';
    }

    return slotRows[0]?.id === rowId ? 'accepted' : 'idempotent';
};

const computePhaseDigests = async (
    acceptedPayloads: readonly SignedPayload[],
): Promise<
    {
        phase: number;
        digest: string;
    }[]
> => {
    const payloadsByPhase = new Map<number, SignedPayload['payload'][]>();

    for (const payload of acceptedPayloads) {
        const entries = payloadsByPhase.get(payload.payload.phase) ?? [];
        entries.push(payload.payload);
        payloadsByPhase.set(payload.payload.phase, entries);
    }

    const phaseDigests = await Promise.all(
        [...payloadsByPhase.entries()]
            .sort(([leftPhase], [rightPhase]) => leftPhase - rightPhase)
            .map(async ([phase, payloads]) => ({
                phase,
                digest: await hashProtocolTranscript(
                    sortProtocolPayloads(payloads),
                ),
            })),
    );

    return phaseDigests;
};

export const classifyBoardMessages = async (
    rows: readonly BoardMessageRow[],
): Promise<ClassifiedBoardMessages> => {
    const sortedRows = sortBoardRows(rows);
    const rowsBySlot = new Map<string, BoardMessageRow[]>();

    for (const row of sortedRows) {
        const existing = rowsBySlot.get(row.slotKey) ?? [];
        existing.push(row);
        rowsBySlot.set(row.slotKey, existing);
    }

    const records: BoardMessageRecord[] = [];
    const acceptedRows: BoardMessageRow[] = [];
    let duplicateCount = 0;
    let equivocationCount = 0;

    for (const row of sortedRows) {
        const slotRows = rowsBySlot.get(row.slotKey) ?? [];
        const classification = classifySlotRows(slotRows, row.id);

        if (classification === 'accepted') {
            acceptedRows.push(row);
        } else if (classification === 'idempotent') {
            duplicateCount += 1;
        } else {
            equivocationCount += 1;
        }

        records.push(toBoardMessageRecord(row, classification));
    }

    if (acceptedRows.length === 0) {
        return {
            acceptedPayloads: [],
            boardAudit: {
                acceptedCount: 0,
                duplicateCount,
                equivocationCount,
                ceremonyDigest: null,
                phaseDigests: [],
            },
            records,
        };
    }

    const acceptedPayloads = acceptedRows.map((row) => row.signedPayload);
    const orderedPayloads = sortProtocolPayloads(
        acceptedPayloads.map((payload) => payload.payload),
    );
    const phaseDigests = await computePhaseDigests(acceptedPayloads);

    return {
        acceptedPayloads,
        boardAudit: {
            acceptedCount: acceptedRows.length,
            duplicateCount,
            equivocationCount,
            ceremonyDigest:
                equivocationCount > 0
                    ? null
                    : await hashProtocolTranscript(orderedPayloads),
            phaseDigests: equivocationCount > 0 ? [] : phaseDigests,
        },
        records,
    };
};

export const classifyBoardMessageRow = (
    row: BoardMessageRow,
    slotRows: readonly BoardMessageRow[],
): BoardMessageRecord =>
    toBoardMessageRecord(
        row,
        classifySlotRows(sortBoardRows(slotRows), row.id),
    );

export const getBoardMessageRows = async (
    db: ReadOnlyDatabase,
    pollId: string,
): Promise<BoardMessageRow[]> =>
    await db
        .select()
        .from(boardMessages)
        .where(eq(boardMessages.pollId, pollId))
        .orderBy(asc(boardMessages.createdAt), asc(boardMessages.id));

export const getBoardMessageSlotRows = async (
    db: ReadOnlyDatabase,
    pollId: string,
    slotKey: string,
): Promise<BoardMessageRow[]> =>
    await db
        .select()
        .from(boardMessages)
        .where(
            and(
                eq(boardMessages.pollId, pollId),
                eq(boardMessages.slotKey, slotKey),
            ),
        )
        .orderBy(asc(boardMessages.createdAt), asc(boardMessages.id));

export const getLastBoardEntryHash = async (
    db: DatabaseTransaction,
    pollId: string,
): Promise<string | null> => {
    const [lastRow] = await db
        .select({
            entryHash: boardMessages.entryHash,
        })
        .from(boardMessages)
        .where(eq(boardMessages.pollId, pollId))
        .orderBy(desc(boardMessages.createdAt), desc(boardMessages.id))
        .limit(1);

    return lastRow?.entryHash ?? null;
};

export const boardMessageSlotKey = (signedPayload: SignedPayload): string =>
    protocolPayloadSlotKey(signedPayload.payload);
