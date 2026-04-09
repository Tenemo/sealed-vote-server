import { and, eq } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../db/client.js';
import {
    decryptionShares,
    encryptedVotes,
    publicKeyShares,
} from '../db/schema.js';

type OrderedDecryptionShareRow = {
    shares: typeof decryptionShares.$inferSelect.shares;
};

type OrderedEncryptedVoteRow = {
    votes: typeof encryptedVotes.$inferSelect.votes;
};

type OrderedPublicKeyShareRow = {
    publicKeyShare: string;
};

type ExistingPublicKeyShareRow = {
    publicKeyShare: string;
};

type ExistingEncryptedVoteRow = {
    votes: typeof encryptedVotes.$inferSelect.votes;
};

type ExistingDecryptionSharesRow = {
    shares: typeof decryptionShares.$inferSelect.shares;
};

type ReadOnlyDatabase = Database | DatabaseTransaction;

type OrderedRowWithVoter<T> = T & {
    voter: {
        voterIndex: number;
    } | null;
};

const findExistingPublicKeyShare = async (
    db: ReadOnlyDatabase,
    pollId: string,
    voterId: string,
    shouldLock: boolean,
): Promise<ExistingPublicKeyShareRow | undefined> => {
    if (shouldLock) {
        const [row] = await db
            .select({
                publicKeyShare: publicKeyShares.publicKeyShare,
            })
            .from(publicKeyShares)
            .where(
                and(
                    eq(publicKeyShares.pollId, pollId),
                    eq(publicKeyShares.voterId, voterId),
                ),
            )
            .for('update');

        return row;
    }

    const [row] = await db
        .select({
            publicKeyShare: publicKeyShares.publicKeyShare,
        })
        .from(publicKeyShares)
        .where(
            and(
                eq(publicKeyShares.pollId, pollId),
                eq(publicKeyShares.voterId, voterId),
            ),
        );

    return row;
};

const findExistingEncryptedVote = async (
    db: ReadOnlyDatabase,
    pollId: string,
    voterId: string,
    shouldLock: boolean,
): Promise<ExistingEncryptedVoteRow | undefined> => {
    if (shouldLock) {
        const [row] = await db
            .select({
                votes: encryptedVotes.votes,
            })
            .from(encryptedVotes)
            .where(
                and(
                    eq(encryptedVotes.pollId, pollId),
                    eq(encryptedVotes.voterId, voterId),
                ),
            )
            .for('update');

        return row;
    }

    const [row] = await db
        .select({
            votes: encryptedVotes.votes,
        })
        .from(encryptedVotes)
        .where(
            and(
                eq(encryptedVotes.pollId, pollId),
                eq(encryptedVotes.voterId, voterId),
            ),
        );

    return row;
};

const findExistingDecryptionShares = async (
    db: ReadOnlyDatabase,
    pollId: string,
    voterId: string,
    shouldLock: boolean,
): Promise<ExistingDecryptionSharesRow | undefined> => {
    if (shouldLock) {
        const [row] = await db
            .select({
                shares: decryptionShares.shares,
            })
            .from(decryptionShares)
            .where(
                and(
                    eq(decryptionShares.pollId, pollId),
                    eq(decryptionShares.voterId, voterId),
                ),
            )
            .for('update');

        return row;
    }

    const [row] = await db
        .select({
            shares: decryptionShares.shares,
        })
        .from(decryptionShares)
        .where(
            and(
                eq(decryptionShares.pollId, pollId),
                eq(decryptionShares.voterId, voterId),
            ),
        );

    return row;
};

export const sortRowsByVoterIndex = <T extends OrderedRowWithVoter<object>>(
    rows: T[],
): T[] =>
    rows.sort(
        (left, right) =>
            (left.voter?.voterIndex ?? 0) - (right.voter?.voterIndex ?? 0),
    );

export const getOrderedPollDecryptionShares = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<OrderedDecryptionShareRow[]> => {
    const rows = await tx.query.decryptionShares.findMany({
        where: (fields, { eq: isEqual }) => isEqual(fields.pollId, pollId),
        columns: {
            shares: true,
        },
        with: {
            voter: {
                columns: {
                    voterIndex: true,
                },
            },
        },
    });

    return sortRowsByVoterIndex(rows).map(({ shares }) => ({ shares }));
};

export const getOrderedPollEncryptedVotes = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<OrderedEncryptedVoteRow[]> => {
    const rows = await tx.query.encryptedVotes.findMany({
        where: (fields, { eq: isEqual }) => isEqual(fields.pollId, pollId),
        columns: {
            votes: true,
        },
        with: {
            voter: {
                columns: {
                    voterIndex: true,
                },
            },
        },
    });

    return sortRowsByVoterIndex(rows).map(({ votes }) => ({ votes }));
};

export const getOrderedPollPublicKeyShares = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<OrderedPublicKeyShareRow[]> => {
    const rows = await tx.query.publicKeyShares.findMany({
        where: (fields, { eq: isEqual }) => isEqual(fields.pollId, pollId),
        columns: {
            publicKeyShare: true,
        },
        with: {
            voter: {
                columns: {
                    voterIndex: true,
                },
            },
        },
    });

    return sortRowsByVoterIndex(rows).map(({ publicKeyShare }) => ({
        publicKeyShare,
    }));
};

export const getExistingPublicKeyShare = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingPublicKeyShareRow | undefined> =>
    await findExistingPublicKeyShare(tx, pollId, voterId, true);

export const getExistingPublicKeyShareReadOnly = async (
    db: ReadOnlyDatabase,
    pollId: string,
    voterId: string,
): Promise<ExistingPublicKeyShareRow | undefined> =>
    await findExistingPublicKeyShare(db, pollId, voterId, false);

export const getExistingEncryptedVote = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingEncryptedVoteRow | undefined> =>
    await findExistingEncryptedVote(tx, pollId, voterId, true);

export const getExistingEncryptedVoteReadOnly = async (
    db: ReadOnlyDatabase,
    pollId: string,
    voterId: string,
): Promise<ExistingEncryptedVoteRow | undefined> =>
    await findExistingEncryptedVote(db, pollId, voterId, false);

export const getExistingDecryptionShares = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingDecryptionSharesRow | undefined> =>
    await findExistingDecryptionShares(tx, pollId, voterId, true);

export const getExistingDecryptionSharesReadOnly = async (
    db: ReadOnlyDatabase,
    pollId: string,
    voterId: string,
): Promise<ExistingDecryptionSharesRow | undefined> =>
    await findExistingDecryptionShares(db, pollId, voterId, false);
