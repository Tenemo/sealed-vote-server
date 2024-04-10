import sql from '@nearform/sql';
import { Type, Static } from '@sinclair/typebox';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import createError from 'http-errors';
import { combinePublicKeys } from 'threshold-elgamal';

import { uuidRegex } from '../constants';

const PublicKeyShareRequest = Type.Object({
    publicKeyShare: Type.String(),
});

type PublicKeyShareRequest = Static<typeof PublicKeyShareRequest>;

const PublicKeyShareResponse = Type.Object({
    message: Type.String(),
});

export type PublicKeyShareResponse = Static<typeof PublicKeyShareResponse>;

const schema = {
    body: PublicKeyShareRequest,
    response: {
        201: PublicKeyShareResponse,
        400: Type.Object({
            message: Type.String(),
        }),
        404: Type.Object({
            message: Type.String(),
        }),
    },
};

export const publicKeyShare = async (
    fastify: FastifyInstance,
): Promise<void> => {
    fastify.post(
        '/polls/:pollId/public-key-share',
        { schema },
        async (
            req: FastifyRequest<{
                Body: PublicKeyShareRequest;
                Params: { pollId: string };
            }>,
            reply: FastifyReply,
        ): Promise<PublicKeyShareResponse> => {
            try {
                const { publicKeyShare } = req.body;
                const { pollId } = req.params;

                if (!uuidRegex.test(pollId)) {
                    throw createError(400, 'Invalid poll ID');
                }

                const sqlFindPoll = sql`
                SELECT id, is_open
                FROM polls
                WHERE id = ${pollId}
            `;
                const { rows } = await fastify.pg.query<{
                    id: string;
                    is_open: boolean;
                }>(sqlFindPoll);
                if (rows.length === 0) {
                    throw createError(
                        404,
                        `Poll with ID ${pollId} does not exist.`,
                    );
                }

                if (rows[0].is_open) {
                    throw createError(
                        400,
                        'Public key shares can only be submitted for a closed poll.',
                    );
                }

                const sqlInsertPublicKeyShare = sql`
                INSERT INTO public_key_shares (poll_id, public_key_share)
                VALUES (${pollId}, ${publicKeyShare})
            `;
                await fastify.pg.query(sqlInsertPublicKeyShare);

                const sqlGetPublicKeyShares = sql`
                SELECT public_key_share
                FROM public_key_shares
                WHERE poll_id = ${pollId}
            `;
                const { rows: publicKeyShares } = await fastify.pg.query<{
                    public_key_share: string;
                }>(sqlGetPublicKeyShares);

                const sqlGetVotersCount = sql`
                SELECT COUNT(*) AS voters_count
                FROM voters
                WHERE poll_id = ${pollId}
            `;
                const { rows: votersCounts } = await fastify.pg.query<{
                    voters_count: string;
                }>(sqlGetVotersCount);
                const votersCount = votersCounts[0].voters_count;

                if (publicKeyShares.length === Number(votersCount)) {
                    const publicKeySharesBigInt = publicKeyShares.map(
                        ({ public_key_share }) => BigInt(public_key_share),
                    );
                    const combinedPublicKey = combinePublicKeys(
                        publicKeySharesBigInt,
                    );

                    const sqlUpdatePoll = sql`
                    UPDATE polls
                    SET common_public_key = ${combinedPublicKey.toString()}
                    WHERE id = ${pollId}
                `;
                    await fastify.pg.query(sqlUpdatePoll);
                }

                void reply.code(201);
                return { message: 'Public key share submitted successfully' };
            } catch (error) {
                if (!(error instanceof createError.HttpError)) {
                    console.error(error);
                }
                throw error;
            }
        },
    );
};
