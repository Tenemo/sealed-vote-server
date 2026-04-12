import { eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import { polls } from '../db/schema.js';

type LockedPoll = {
    createdAt: Date;
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
            createdAt: polls.createdAt,
            id: polls.id,
            isOpen: polls.isOpen,
            creatorTokenHash: polls.creatorTokenHash,
        })
        .from(polls)
        .where(eq(polls.id, pollId))
        .for('update');

    return poll;
};

export type { LockedPoll };

export const lockPollByIdForCreatorAction = lockPollById;
