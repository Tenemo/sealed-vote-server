import { FastifyInstance, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const BodySchema = Type.Object({
    cipherText: Type.String(),
});

type BodySchema = Static<typeof BodySchema>;

const ResponseSchema = Type.Object({
    result: Type.String(),
});

type ResponseSchema = Static<typeof ResponseSchema>;

const schema = {
    body: BodySchema,
    response: {
        200: ResponseSchema,
    },
};
const vote = async (fastify: FastifyInstance): Promise<void> => {
    fastify.post(
        '/polls/:pollId',
        { schema },
        async (
            req: FastifyRequest<{ Body: BodySchema }>,
        ): Promise<ResponseSchema> => {
            return {
                result: req.body.cipherText,
            };
        },
    );
};

export default vote;
