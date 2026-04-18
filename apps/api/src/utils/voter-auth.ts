import crypto from 'crypto';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { and, eq } from 'drizzle-orm';
import createError from 'http-errors';

import type { Database, DatabaseTransaction } from '../database/client.js';
import { voters } from '../database/schema.js';

type AuthenticatedVoter = {
    id: string;
    voterName: string;
    voterIndex: number;
};

export type { AuthenticatedVoter };

export const hashSecureToken = (value: string): string =>
    crypto.createHash('sha256').update(value).digest('hex');

export const authenticateVoter = async (
    databaseTransaction: DatabaseTransaction,
    pollId: string,
    voterToken: string,
): Promise<AuthenticatedVoter> => {
    const voterTokenHash = hashSecureToken(voterToken);
    const [voter] = await databaseTransaction
        .select({
            id: voters.id,
            voterName: voters.voterName,
            voterIndex: voters.voterIndex,
        })
        .from(voters)
        .where(
            and(
                eq(voters.pollId, pollId),
                eq(voters.voterTokenHash, voterTokenHash),
            ),
        )
        .for('update');

    if (!voter) {
        throw createError(403, ERROR_MESSAGES.invalidVoterToken);
    }

    return voter;
};

export const authenticateVoterReadOnly = async (
    databaseTransaction: Database | DatabaseTransaction,
    pollId: string,
    voterToken: string,
): Promise<AuthenticatedVoter> => {
    const voterTokenHash = hashSecureToken(voterToken);
    const [voter] = await databaseTransaction
        .select({
            id: voters.id,
            voterName: voters.voterName,
            voterIndex: voters.voterIndex,
        })
        .from(voters)
        .where(
            and(
                eq(voters.pollId, pollId),
                eq(voters.voterTokenHash, voterTokenHash),
            ),
        );

    if (!voter) {
        throw createError(403, ERROR_MESSAGES.invalidVoterToken);
    }

    return voter;
};
