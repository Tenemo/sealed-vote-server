import crypto from 'crypto';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { and, eq } from 'drizzle-orm';
import createError from 'http-errors';

import type { DatabaseTransaction } from '../db/client.js';
import { voters } from '../db/schema.js';

export type AuthenticatedVoter = {
    id: string;
    voterName: string;
    voterIndex: number;
    hasSubmittedPublicKeyShare: boolean;
    hasVoted: boolean;
    hasSubmittedDecryptionShares: boolean;
};

export const generateSecureToken = (): string =>
    crypto.randomBytes(32).toString('hex');

export const hashSecureToken = (value: string): string =>
    crypto.createHash('sha256').update(value).digest('hex');

export const authenticateVoter = async (
    tx: DatabaseTransaction,
    pollId: string,
    voterToken: string,
): Promise<AuthenticatedVoter> => {
    const voterTokenHash = hashSecureToken(voterToken);
    const [voter] = await tx
        .select({
            id: voters.id,
            voterName: voters.voterName,
            voterIndex: voters.voterIndex,
            hasSubmittedPublicKeyShare: voters.hasSubmittedPublicKeyShare,
            hasVoted: voters.hasVoted,
            hasSubmittedDecryptionShares: voters.hasSubmittedDecryptionShares,
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
