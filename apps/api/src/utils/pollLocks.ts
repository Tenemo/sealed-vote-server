import { eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import { polls } from '../db/schema.js';

type LockedPoll = {
    id: string;
    isOpen: boolean;
    maxParticipants: number;
    commonPublicKey: string | null;
    encryptedTallies: typeof polls.$inferSelect.encryptedTallies;
    resultTallies: typeof polls.$inferSelect.resultTallies;
    resultScores: typeof polls.$inferSelect.resultScores;
};

type LockedCreatorPoll = {
    id: string;
    isOpen: boolean;
    creatorTokenHash: string;
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
