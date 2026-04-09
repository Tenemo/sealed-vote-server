import { and, asc, eq } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../db/client.js';
import {
    decryptionShares,
    encryptedVotes,
    publicKeyShares,
    voters,
} from '../db/schema.js';

type SubmissionTable =
    | typeof publicKeyShares
    | typeof encryptedVotes
    | typeof decryptionShares;

type SubmissionValueColumn =
    | typeof publicKeyShares.publicKeyShare
    | typeof encryptedVotes.votes
    | typeof decryptionShares.shares;

type ReadOnlyDatabase = Database | DatabaseTransaction;

const loadSubmissionValue = async <TValue>({
    db,
    pollId,
    shouldLock,
    table,
    valueColumn,
    voterId,
}: {
    db: ReadOnlyDatabase;
    pollId: string;
    shouldLock: boolean;
    table: SubmissionTable;
    valueColumn: SubmissionValueColumn;
    voterId: string;
}): Promise<TValue | undefined> => {
    const query = db
        .select({ value: valueColumn })
        .from(table as SubmissionTable)
        .where(and(eq(table.pollId, pollId), eq(table.voterId, voterId)));
    const rows = shouldLock ? await query.for('update') : await query;

    return (rows[0] as { value: TValue } | undefined)?.value;
};

export const getExistingPollSubmissionValue = async <TValue>({
    db,
    pollId,
    shouldLock = false,
    table,
    valueColumn,
    voterId,
}: {
    db: ReadOnlyDatabase;
    pollId: string;
    shouldLock?: boolean;
    table: SubmissionTable;
    valueColumn: SubmissionValueColumn;
    voterId: string;
}): Promise<TValue | undefined> =>
    await loadSubmissionValue({
        db,
        pollId,
        shouldLock,
        table,
        valueColumn,
        voterId,
    });

export const getOrderedPollSubmissionValues = async <TValue>({
    db,
    pollId,
    table,
    valueColumn,
}: {
    db: ReadOnlyDatabase;
    pollId: string;
    table: SubmissionTable;
    valueColumn: SubmissionValueColumn;
}): Promise<TValue[]> => {
    const rows = await db
        .select({
            value: valueColumn,
        })
        .from(table)
        .innerJoin(voters, eq(table.voterId, voters.id))
        .where(eq(table.pollId, pollId))
        .orderBy(asc(voters.voterIndex));

    return rows.map(({ value }) => value as TValue);
};
