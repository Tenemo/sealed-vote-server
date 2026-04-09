import { count, eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import { choices, encryptedVotes, voters } from '../db/schema.js';

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
