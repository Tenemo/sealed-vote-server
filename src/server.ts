import Fastify, { FastifyInstance } from 'fastify';
import FastifyPostgres from 'fastify-postgres';

import vote from 'routes/vote';
import createVote from 'routes/create-poll';
import results from 'routes/poll';
import config from 'config';

const buildServer = async (): Promise<FastifyInstance> => {
    const fastify = Fastify({
        logger: {
            level: config.LOG_LEVEL,
            prettyPrint: config.PRETTY_PRINT,
        },
    });
    await fastify.register(FastifyPostgres, {
        connectionString: `postgres://${config.PG_USER}:${config.PG_PASSWORD}@${config.PG_HOST}:${config.PG_PORT}/${config.PG_DB}`,
    });
    await fastify.register(vote, { prefix: '/api' });
    await fastify.register(createVote, { prefix: '/api' });
    await fastify.register(results, { prefix: '/api' });
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
