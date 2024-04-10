import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import sql from '@nearform/sql';
import createError from 'http-errors';
import { uuidRegex } from '../constants';

const DecryptionSharesRequest = Type.Object({
    decryptionShares: Type.Array(Type.Array(Type.String())),
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
                }>(sqlFetchExistingShares);

                if (existingSharesResult.rows.length === 0) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

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
