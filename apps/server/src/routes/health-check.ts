import { sql } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';

export const healthCheck = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get('/health-check', async (_request, reply) => {
        try {
            await fastify.db.execute(sql`SELECT 1`);
            await reply.send({ service: 'OK', database: 'OK' });
        } catch {
            await reply.code(503).send({ service: 'OK', database: 'Failed' });
        }
    });
};
