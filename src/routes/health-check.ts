import { FastifyInstance } from 'fastify';

 const healthCheck = async (fastify: FastifyInstance) => {
  fastify.get('/health-check', async (_request, reply) => {
    reply.send('OK');
  });
};

export default healthCheck;
