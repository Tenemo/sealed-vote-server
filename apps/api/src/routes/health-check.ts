import { FastifyInstance } from 'fastify';

import { polls } from '../db/schema.js';

export const healthCheck = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get('/health-check', async (_request, reply) => {
        try {
            await fastify.db.select({ id: polls.id }).from(polls).limit(1);
            await reply.send({ service: 'OK', database: 'OK' });
        } catch {
            await reply.code(503).send({ service: 'OK', database: 'Failed' });
        }
    });
};
