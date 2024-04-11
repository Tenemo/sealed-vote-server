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
    const { rows: encryptedTalliesRows } = await fastify.pg.query<{
        encrypted_tallies: {
            c1: string;
            c2: string;
        }[];
    }>(encryptedTalliesQuery);

    const decryptionSharesQuery = sql`
        SELECT decryption_shares FROM polls WHERE id = ${pollId}
    `;
    const { rows: decryptionSharesRows } = await fastify.pg.query<{
        decryption_shares: string[][];
    }>(decryptionSharesQuery);

    if (
        encryptedTalliesRows.length === 0 ||
        decryptionSharesRows.length === 0
    ) {
        throw new Error('Poll data is incomplete.');
    }

    const encryptedTalliesData = encryptedTalliesRows[0].encrypted_tallies;
    const decryptionSharesData = decryptionSharesRows[0].decryption_shares;

    const results: number[] = encryptedTalliesData.map((tally, index) => {
        const combinedShares = combineDecryptionShares(
            decryptionSharesData.map((share) => BigInt(share[index])),
        );
        return thresholdDecrypt(
            deserializeEncryptedMessage(tally),
            combinedShares,
        );
    });
    if (!results.every((result) => Number.isFinite(result))) {
        throw new Error('Failed to calculate results.');
    }

    const resultsParams = results.map((result) => sql`${result}`);
    const resultsList = sql.glue(resultsParams, ', ');

    const updateResultsQuery = sql`
        UPDATE polls
        SET results = ARRAY[${resultsList}]::int[]
        WHERE id = ${pollId};
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
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }

                const pollStateQuery = sql`
                    SELECT polls.decryption_shares
                    FROM polls
                    WHERE polls.id = ${pollId}
                `;
                const { rows: pollStateRows } = await fastify.pg.query<{
                    decryption_shares: string[][];
                }>(pollStateQuery);

                if (pollStateRows.length === 0) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                const existingDecryptionShares =
                    pollStateRows[0].decryption_shares;

                const sqlSelectVoters = sql`
                SELECT voter_name
                FROM voters
                WHERE poll_id = ${pollId}
            `;
                const { rows: voterRows } = await fastify.pg.query<{
                    voter_name: string;
                }>(sqlSelectVoters);
                const voters = voterRows.map(({ voter_name }) => voter_name);

                if (!voters || voters.length === 0) {
                    throw createError(404, 'No voters found for this poll.');
                }
                if (existingDecryptionShares.length >= voters.length) {
                    throw createError(
                        400,
                        'All decryption shares have already been submitted.',
                    );
                }

                const { decryptionShares } = req.body;
                const updatedShares = [
                    ...existingDecryptionShares,
                    decryptionShares,
                ];

                const sqlUpdateDecryptionShare = sql`
                    UPDATE polls
                    SET decryption_shares = ${JSON.stringify(updatedShares)}::jsonb
                    WHERE id = ${pollId};
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
