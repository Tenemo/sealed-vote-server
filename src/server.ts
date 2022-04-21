import Fastify, { FastifyInstance } from 'fastify';
import health from 'routes/health';
import config from 'config';

const buildServer = async (): Promise<FastifyInstance> => {
    const fastify = Fastify({
        logger: {
            level: config.LOG_LEVEL,
        },
    });
    await fastify.register(health);
    return fastify;
};

const start = async (): Promise<void> => {
    const fastify = await buildServer();

    try {
        await fastify.listen(config.PORT);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

void start();
