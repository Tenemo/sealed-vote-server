import { and, asc, count, eq } from 'drizzle-orm';

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
    results: typeof polls.$inferSelect.results;
};

export type LockedCreatorPoll = {
    id: string;
    isOpen: boolean;
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
            results: polls.results,
        })
        .from(polls)
        .where(eq(polls.id, pollId))
        .for('update');

    return poll;
};

export const lockPollByIdAndCreatorToken = async (
    tx: DatabaseTransaction,
    pollId: string,
    creatorToken: string,
): Promise<LockedCreatorPoll | undefined> => {
    const [poll] = await tx
        .select({
            id: polls.id,
            isOpen: polls.isOpen,
        })
        .from(polls)
        .where(and(eq(polls.id, pollId), eq(polls.creatorToken, creatorToken)))
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
): Promise<OrderedDecryptionShareRow[]> =>
    tx
        .select({
            shares: decryptionShares.shares,
        })
        .from(decryptionShares)
        .innerJoin(voters, eq(voters.id, decryptionShares.voterId))
        .where(eq(decryptionShares.pollId, pollId))
        .orderBy(asc(voters.voterIndex));

export const getOrderedPollEncryptedVotes = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<OrderedEncryptedVoteRow[]> =>
    tx
        .select({
            votes: encryptedVotes.votes,
        })
        .from(encryptedVotes)
        .innerJoin(voters, eq(voters.id, encryptedVotes.voterId))
        .where(eq(encryptedVotes.pollId, pollId))
        .orderBy(asc(voters.voterIndex));

export const getOrderedPollPublicKeyShares = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<OrderedPublicKeyShareRow[]> =>
    tx
        .select({
            publicKeyShare: publicKeyShares.publicKeyShare,
        })
        .from(publicKeyShares)
        .innerJoin(voters, eq(voters.id, publicKeyShares.voterId))
        .where(eq(publicKeyShares.pollId, pollId))
        .orderBy(asc(voters.voterIndex));
