import { FastifyInstance } from 'fastify';

const healthCheck = async (fastify: FastifyInstance): Promise<void> => {
    fastify.get('/health-check', async (_request, reply) => {
        void reply.send('OK');
    });
};

export default healthCheck;
