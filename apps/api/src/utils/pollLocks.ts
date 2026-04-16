import { eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import { polls } from '../db/schema.js';

type LockedPoll = {
    createdAt: Date;
    creatorTokenHash: string;
    id: string;
    isOpen: boolean;
    protocolVersion: string;
};

export const lockPollById = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<LockedPoll | undefined> => {
    const [poll] = await tx
        .select({
            createdAt: polls.createdAt,
            creatorTokenHash: polls.creatorTokenHash,
            id: polls.id,
            isOpen: polls.isOpen,
            protocolVersion: polls.protocolVersion,
        })
        .from(polls)
        .where(eq(polls.id, pollId))
        .for('update');

    return poll;
};

export type { LockedPoll };
