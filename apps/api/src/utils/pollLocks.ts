import { eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import { polls } from '../db/schema.js';

type LockedPoll = {
    id: string;
    isOpen: boolean;
    creatorTokenHash: string;
    requestedReconstructionThreshold: number | null;
    requestedMinimumPublishedVoterCount: number | null;
    protocolVersion: string;
};

export const lockPollById = async (
    tx: DatabaseTransaction,
    pollId: string,
): Promise<LockedPoll | undefined> => {
    const [poll] = await tx
        .select({
            id: polls.id,
            isOpen: polls.isOpen,
            creatorTokenHash: polls.creatorTokenHash,
            requestedReconstructionThreshold:
                polls.requestedReconstructionThreshold,
            requestedMinimumPublishedVoterCount:
                polls.requestedMinimumPublishedVoterCount,
            protocolVersion: polls.protocolVersion,
        })
        .from(polls)
        .where(eq(polls.id, pollId))
        .for('update');

    return poll;
};

export type { LockedPoll };

export const lockPollByIdForCreatorAction = lockPollById;
