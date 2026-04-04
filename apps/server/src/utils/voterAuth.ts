import crypto from 'crypto';

import sql from '@nearform/sql';
import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import createError from 'http-errors';
import type { PoolClient } from 'pg';

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
    client: PoolClient,
    pollId: string,
    voterToken: string,
): Promise<AuthenticatedVoter> => {
    const voterTokenHash = hashSecureToken(voterToken);
    const query = sql`
        SELECT
            id,
            voter_name,
            voter_index,
            has_submitted_public_key_share,
            has_voted,
            has_submitted_decryption_shares
        FROM voters
        WHERE poll_id = ${pollId} AND voter_token_hash = ${voterTokenHash}
        FOR UPDATE
    `;

    const { rows } = await client.query<{
        id: string;
        voter_name: string;
        voter_index: number;
        has_submitted_public_key_share: boolean;
        has_voted: boolean;
        has_submitted_decryption_shares: boolean;
    }>(query);

    const voter = rows[0];
    if (!voter) {
        throw createError(403, ERROR_MESSAGES.invalidVoterToken);
    }

    return {
        id: voter.id,
        voterName: voter.voter_name,
        voterIndex: voter.voter_index,
        hasSubmittedPublicKeyShare: voter.has_submitted_public_key_share,
        hasVoted: voter.has_voted,
        hasSubmittedDecryptionShares: voter.has_submitted_decryption_shares,
    };
};
