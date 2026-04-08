import crypto from 'crypto';

import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { and, eq } from 'drizzle-orm';
import createError from 'http-errors';

import type { Database, DatabaseTransaction } from '../db/client.js';
import { voters } from '../db/schema.js';

export type AuthenticatedVoter = {
    id: string;
    voterName: string;
    voterIndex: number;
};

export type AuthenticatedCreator = {
    pollId: string;
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
    tx: Database | DatabaseTransaction,
    pollId: string,
    voterToken: string,
): Promise<AuthenticatedVoter> => {
    const voterTokenHash = hashSecureToken(voterToken);
    const [voter] = await tx
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

export const findVoterByTokenReadOnly = async (
    tx: Database | DatabaseTransaction,
    pollId: string,
    voterToken: string,
): Promise<AuthenticatedVoter | undefined> => {
    const voterTokenHash = hashSecureToken(voterToken);
    const [voter] = await tx
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

    return voter;
};

export const isSecureToken = (value: string): boolean =>
    typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
