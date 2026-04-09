import { isUuid } from '@sealed-vote/contracts';
import { count, eq } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../db/client.js';
import {
    decryptionShares,
    encryptedVotes,
    polls,
    publicKeyShares,
    voters,
} from '../db/schema.js';

import { normalizeDatabaseTimestamp } from './db.js';
import { getOrderedPollSubmissionValues } from './pollSubmissions.js';

type ReadOnlyDatabase = Database | DatabaseTransaction;

type PollCounts = {
    decryptionShareCount: number;
    encryptedVoteCount: number;
    publicKeyShareCount: number;
    voterCount: number;
};

export type PollFetchReadModel = {
    choices: string[];
    commonPublicKey: string | null;
    createdAt: string;
    decryptionShareCount: number;
    encryptedTallies: typeof polls.$inferSelect.encryptedTallies;
    encryptedVoteCount: number;
    id: string;
    isOpen: boolean;
    pollName: string;
    publicKeyShareCount: number;
    publishedDecryptionShares: string[][];
    resultScores: number[];
    resultTallies: string[];
    slug: string;
    voters: string[];
};

export type PollPhaseReadModel = {
    commonPublicKey: string | null;
    encryptedTallyCount: number;
    encryptedVoteCount: number;
    id: string;
    isOpen: boolean;
    pollName?: string;
    resultScoreCount: number;
    slug: string;
    voterCount: number;
};

const getCount = async (
    db: ReadOnlyDatabase,
    pollId: string,
    table:
        | typeof publicKeyShares
        | typeof encryptedVotes
        | typeof decryptionShares
        | typeof voters,
): Promise<number> => {
    const [row] = await db
        .select({ count: count() })
        .from(table)
        .where(eq(table.pollId, pollId));

    return row?.count ?? 0;
};

const getPollCounts = async (
    db: ReadOnlyDatabase,
    pollId: string,
): Promise<PollCounts> => {
    const [
        voterCount,
        publicKeyShareCount,
        encryptedVoteCount,
        decryptionShareCount,
    ] = await Promise.all([
        getCount(db, pollId, voters),
        getCount(db, pollId, publicKeyShares),
        getCount(db, pollId, encryptedVotes),
        getCount(db, pollId, decryptionShares),
    ]);

    return {
        decryptionShareCount,
        encryptedVoteCount,
        publicKeyShareCount,
        voterCount,
    };
};

export const getPollFetchReadModel = async (
    db: ReadOnlyDatabase,
    pollRef: string,
): Promise<PollFetchReadModel | undefined> => {
    const poll = await db.query.polls.findFirst({
        where: (fields, { eq: isEqual }) =>
            isUuid(pollRef)
                ? isEqual(fields.id, pollRef)
                : isEqual(fields.slug, pollRef),
        columns: {
            id: true,
            slug: true,
            pollName: true,
            createdAt: true,
            isOpen: true,
            commonPublicKey: true,
            encryptedTallies: true,
            resultTallies: true,
            resultScores: true,
        },
        with: {
            choices: {
                columns: {
                    choiceName: true,
                },
                orderBy: (fields, { asc: ascending }) =>
                    ascending(fields.choiceIndex),
            },
            voters: {
                columns: {
                    voterName: true,
                },
                orderBy: (fields, { asc: ascending }) =>
                    ascending(fields.voterIndex),
            },
        },
    });

    if (!poll) {
        return undefined;
    }

    const counts = await getPollCounts(db, poll.id);
    const publishedDecryptionShares =
        poll.resultScores.length > 0
            ? await getOrderedPollSubmissionValues<string[]>({
                  db,
                  pollId: poll.id,
                  table: decryptionShares,
                  valueColumn: decryptionShares.shares,
              })
            : [];

    return {
        choices: poll.choices.map(({ choiceName }) => choiceName),
        commonPublicKey: poll.commonPublicKey,
        createdAt: normalizeDatabaseTimestamp(poll.createdAt),
        decryptionShareCount: counts.decryptionShareCount,
        encryptedTallies: poll.encryptedTallies,
        encryptedVoteCount: counts.encryptedVoteCount,
        id: poll.id,
        isOpen: poll.isOpen,
        pollName: poll.pollName,
        publicKeyShareCount: counts.publicKeyShareCount,
        publishedDecryptionShares,
        resultScores: poll.resultScores,
        resultTallies: poll.resultTallies,
        slug: poll.slug,
        voters: poll.voters.map(({ voterName }) => voterName),
    };
};

export const getPollPhaseReadModelById = async (
    db: ReadOnlyDatabase,
    pollId: string,
): Promise<PollPhaseReadModel | undefined> => {
    const poll = await db.query.polls.findFirst({
        where: (fields, { eq: isEqual }) => isEqual(fields.id, pollId),
        columns: {
            id: true,
            slug: true,
            pollName: true,
            isOpen: true,
            commonPublicKey: true,
            encryptedTallies: true,
            resultScores: true,
        },
    });

    if (!poll) {
        return undefined;
    }

    const counts = await getPollCounts(db, pollId);

    return {
        commonPublicKey: poll.commonPublicKey,
        encryptedTallyCount: poll.encryptedTallies.length,
        encryptedVoteCount: counts.encryptedVoteCount,
        id: poll.id,
        isOpen: poll.isOpen,
        pollName: poll.pollName,
        resultScoreCount: poll.resultScores.length,
        slug: poll.slug,
        voterCount: counts.voterCount,
    };
};
