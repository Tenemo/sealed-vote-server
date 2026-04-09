import { and, asc, eq } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../db/client.js';
import {
    decryptionShares,
    encryptedVotes,
    publicKeyShares,
    voters,
} from '../db/schema.js';

type SubmissionSpec =
    | {
          table: typeof publicKeyShares;
          valueColumn: typeof publicKeyShares.publicKeyShare;
      }
    | {
          table: typeof encryptedVotes;
          valueColumn: typeof encryptedVotes.votes;
      }
    | {
          table: typeof decryptionShares;
          valueColumn: typeof decryptionShares.shares;
      };

type ReadOnlyDatabase = Database | DatabaseTransaction;

type SubmissionQueryArgs<TSubmissionSpec extends SubmissionSpec> = {
    db: ReadOnlyDatabase;
    pollId: string;
} & TSubmissionSpec;

type ExistingSubmissionQueryArgs<TSubmissionSpec extends SubmissionSpec> = {
    shouldLock?: boolean;
    voterId: string;
} & SubmissionQueryArgs<TSubmissionSpec>;

type LockedExistingSubmissionQueryArgs<TSubmissionSpec extends SubmissionSpec> =
    Omit<ExistingSubmissionQueryArgs<TSubmissionSpec>, 'shouldLock'> & {
        shouldLock: boolean;
    };

const loadSubmissionValue = async <
    TValue,
    TSubmissionSpec extends SubmissionSpec,
>(
    args: LockedExistingSubmissionQueryArgs<TSubmissionSpec>,
): Promise<TValue | undefined> => {
    const { db, pollId, shouldLock, table, valueColumn, voterId } = args;
    const query = db
        .select({
            value: valueColumn as SubmissionSpec['valueColumn'],
        })
        .from(table as SubmissionSpec['table'])
        .where(and(eq(table.pollId, pollId), eq(table.voterId, voterId)));
    const rows = shouldLock ? await query.for('update') : await query;

    return (rows[0] as { value: TValue } | undefined)?.value;
};

export const getExistingPollSubmissionValue = async <
    TValue,
    TSubmissionSpec extends SubmissionSpec = SubmissionSpec,
>(
    args: ExistingSubmissionQueryArgs<TSubmissionSpec>,
): Promise<TValue | undefined> => {
    const lockedArgs: LockedExistingSubmissionQueryArgs<TSubmissionSpec> = {
        ...args,
        shouldLock: args.shouldLock ?? false,
    };

    return await loadSubmissionValue(lockedArgs);
};

export const getOrderedPollSubmissionValues = async <
    TValue,
    TSubmissionSpec extends SubmissionSpec = SubmissionSpec,
>(
    args: SubmissionQueryArgs<TSubmissionSpec>,
): Promise<TValue[]> => {
    const { db, pollId, table, valueColumn } = args;
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
