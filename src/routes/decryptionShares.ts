import sql from '@nearform/sql';
import { Type, Static } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import {
    thresholdDecrypt,
    combineDecryptionShares,
    deserializeEncryptedMessage,
} from 'threshold-elgamal';

import { uuidRegex } from '../constants';

const calculateAndStoreResults = async (
    fastify: FastifyInstance,
    pollId: string,
): Promise<void> => {
    const encryptedTalliesQuery = sql`
        SELECT encrypted_tallies FROM polls WHERE id = ${pollId}
    `;
    const encryptedTallies = await fastify.pg.query<{
        encrypted_tallies: {
            c1: string;
            c2: string;
        }[];
    }>(encryptedTalliesQuery);

    const decryptionSharesQuery = sql`
        SELECT decryption_shares FROM polls WHERE id = ${pollId}
    `;
    const decryptionSharesResponse = await fastify.pg.query<{
        decryption_shares: string[][];
    }>(decryptionSharesQuery);

    if (
        !encryptedTallies.rows.length ||
        !decryptionSharesResponse.rows.length
    ) {
        throw new Error('Poll data is incomplete.');
    }

    const { encrypted_tallies: encryptedTalliesData } =
        encryptedTallies.rows[0];
    const { decryption_shares: decryptionSharesData } =
        decryptionSharesResponse.rows[0];

    const results: number[] = encryptedTalliesData.map((tally, index) => {
        const combinedShares = combineDecryptionShares(
            decryptionSharesData.map((share) => BigInt(share[index])),
        );
        return thresholdDecrypt(
            deserializeEncryptedMessage(tally),
            combinedShares,
        );
    });

    // eslint-disable-next-line sql/no-unsafe-query
    const updateResultsQuery = `
        UPDATE polls
        SET results = ARRAY [${results.join(', ')}]
        WHERE id = '${pollId}';
    `;
    await fastify.pg.query(updateResultsQuery);
};

const DecryptionSharesRequest = Type.Object({
    decryptionShares: Type.Array(Type.String()),
});

type DecryptionSharesRequest = Static<typeof DecryptionSharesRequest>;

const DecryptionSharesResponse = Type.Object({
    message: Type.String(),
});

export type DecryptionSharesResponse = Static<typeof DecryptionSharesResponse>;

const schema = {
    body: DecryptionSharesRequest,
    response: {
        201: DecryptionSharesResponse,
        400: Type.Object({
            message: Type.String(),
        }),
        404: Type.Object({
            message: Type.String(),
        }),
    },
};

export const decryptionShares = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/decryption-shares',
        { schema },
        async (
            req: FastifyRequest<{
                Body: DecryptionSharesRequest;
                Params: { pollId: string };
            }>,
            reply: FastifyReply,
        ): Promise<DecryptionSharesResponse> => {
            try {
                const { decryptionShares } = req.body;
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }

                // Fetch the existing decryption shares
                const sqlFetchExistingShares = sql`
                    SELECT decryption_shares
                    FROM polls
                    WHERE id = ${pollId}
                `;
                const existingSharesResult = await fastify.pg.query<{
                    decryption_shares: string[][][];
                    voters: string[];
                }>(sqlFetchExistingShares);

                if (existingSharesResult.rows.length === 0) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                const sqlSelectVoters = sql`
                SELECT voter_name
                FROM voters
                WHERE poll_id = ${pollId}
            `;
                const { rows: voterRows } = await fastify.pg.query<{
                    voter_name: string;
                }>(sqlSelectVoters);
                const voters = voterRows.map(({ voter_name }) => voter_name);

                let updatedShares = [];
                if (
                    existingSharesResult.rows.length > 0 &&
                    existingSharesResult.rows[0].decryption_shares
                ) {
                    const existingShares =
                        existingSharesResult.rows[0].decryption_shares;
                    updatedShares = [...existingShares, decryptionShares];
                } else {
                    updatedShares = [decryptionShares];
                }

                const decryptionSharesJson = JSON.stringify(
                    updatedShares,
                ).replace(/'/g, "''");

                // eslint-disable-next-line sql/no-unsafe-query
                const sqlUpdateDecryptionShare = `
                    UPDATE polls
                    SET decryption_shares = '${decryptionSharesJson}'::jsonb
                    WHERE id = '${pollId}';
                `;
                await fastify.pg.query(sqlUpdateDecryptionShare);

                if (updatedShares.length === voters.length) {
                    await calculateAndStoreResults(fastify, pollId);
                }

                void reply.code(201);
                return { message: 'Decryption shares submitted successfully.' };
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }
                throw error;
            }
        },
    );
};
