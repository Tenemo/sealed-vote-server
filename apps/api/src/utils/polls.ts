import { and, count, eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import {
    choices,
    decryptionShares,
    encryptedVotes,
    polls,
    publicKeyShares,
    voters,
} from '../db/schema.js';
export type LockedPoll = {
    id: string;
    isOpen: boolean;
    maxParticipants: number;
    commonPublicKey: string | null;
    encryptedTallies: typeof polls.$inferSelect.encryptedTallies;
    resultTallies: typeof polls.$inferSelect.resultTallies;
    resultScores: typeof polls.$inferSelect.resultScores;
};

export type LockedCreatorPoll = {
    id: string;
    isOpen: boolean;
    creatorTokenHash: string;
};

export type OrderedDecryptionShareRow = {
    shares: typeof decryptionShares.$inferSelect.shares;
};

export type OrderedEncryptedVoteRow = {
    votes: typeof encryptedVotes.$inferSelect.votes;
};

export type OrderedPublicKeyShareRow = {
    publicKeyShare: string;
};

export type ExistingPublicKeyShareRow = {
    publicKeyShare: string;
};

export type ExistingEncryptedVoteRow = {
    votes: typeof encryptedVotes.$inferSelect.votes;
};

export type ExistingDecryptionSharesRow = {
    shares: typeof decryptionShares.$inferSelect.shares;
};

type OrderedRowWithVoter<T> = T & {
    voter: {
        voterIndex: number;
    } | null;
};

export const sortRowsByVoterIndex = <T extends OrderedRowWithVoter<object>>(
    rows: T[],
): T[] =>
    rows.sort(
        (left, right) =>
            (left.voter?.voterIndex ?? 0) - (right.voter?.voterIndex ?? 0),
    );

export const lockPollById = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<LockedPoll | undefined> => {
    const [poll] = await tx
        .select({
            id: polls.id,
            isOpen: polls.isOpen,
            maxParticipants: polls.maxParticipants,
            commonPublicKey: polls.commonPublicKey,
            encryptedTallies: polls.encryptedTallies,
            resultTallies: polls.resultTallies,
            resultScores: polls.resultScores,
        })
        .from(polls)
        .where(eq(polls.id, pollId))
        .for('update');

    return poll;
};

export const lockPollByIdForCreatorAction = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<LockedCreatorPoll | undefined> => {
    const [poll] = await tx
        .select({
            id: polls.id,
            isOpen: polls.isOpen,
            creatorTokenHash: polls.creatorTokenHash,
        })
        .from(polls)
        .where(eq(polls.id, pollId))
        .for('update');

    return poll;
};

export const countPollChoices = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<number> => {
    const [row] = await tx
        .select({ count: count() })
        .from(choices)
        .where(eq(choices.pollId, pollId));

    return row?.count ?? 0;
};

export const countPollEncryptedVotes = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<number> => {
    const [row] = await tx
        .select({ count: count() })
        .from(encryptedVotes)
        .where(eq(encryptedVotes.pollId, pollId));

    return row?.count ?? 0;
};

export const countPollVoters = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<number> => {
    const [row] = await tx
        .select({ count: count() })
        .from(voters)
        .where(eq(voters.pollId, pollId));

    return row?.count ?? 0;
};

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
): Promise<ExistingPublicKeyShareRow | undefined> => {
    const [row] = await tx
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
};

export const getExistingPublicKeyShareReadOnly = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingPublicKeyShareRow | undefined> => {
    const [row] = await tx
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

export const getExistingEncryptedVote = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingEncryptedVoteRow | undefined> => {
    const [row] = await tx
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
};

export const getExistingEncryptedVoteReadOnly = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingEncryptedVoteRow | undefined> => {
    const [row] = await tx
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

export const getExistingDecryptionShares = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingDecryptionSharesRow | undefined> => {
    const [row] = await tx
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
};

export const getExistingDecryptionSharesReadOnly = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterId: string,
): Promise<ExistingDecryptionSharesRow | undefined> => {
    const [row] = await tx
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
