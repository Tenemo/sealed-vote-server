import { FastifyInstance } from 'fastify';

export const healthCheck = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get('/health-check', async (_request, reply) => {
        try {
            await fastify.pg.query('SELECT 1');
            await reply.send({ service: 'OK', database: 'OK' });
        } catch (error) {
            await reply.code(503).send({ service: 'OK', database: 'Failed' });
        }
    });
};
