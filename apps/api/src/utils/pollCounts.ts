import { count, eq } from 'drizzle-orm';

import type { DatabaseTransaction } from '../db/client.js';
import { voters } from '../db/schema.js';

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
