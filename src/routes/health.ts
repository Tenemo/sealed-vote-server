import { FastifyPluginAsync } from 'fastify';

const health: FastifyPluginAsync = async (fastify) => {
    fastify.get('/health', async () => {
        return { status: 'OK' };
    });
};

export default health;
