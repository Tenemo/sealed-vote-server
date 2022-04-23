import Fastify, { FastifyInstance } from 'fastify';
import FastifyPostgres from 'fastify-postgres';
import dotenv from 'dotenv';

import vote from 'routes/vote';
import createVote from 'routes/create-poll';
import results from 'routes/poll';

dotenv.config();

const TIMEOUT = 30 * 1000;

const buildServer = async (): Promise<FastifyInstance> => {
    const fastify = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            prettyPrint: !!(process.env.PRETTY_PRINT === 'true'),
        },
    });
    await fastify.register(FastifyPostgres, {
        connectionString:
            process.env.DATABASE_URL ??
            'postgres://postgres:postgres@localhost:5432/sv-db',
        ssl: {
            rejectUnauthorized: false,
        },
        statement_timeout: TIMEOUT,
        query_timeout: TIMEOUT,
        idle_in_transaction_session_timeout: TIMEOUT,
        connectionTimeoutMillis: TIMEOUT,
    });
    await fastify.register(vote, { prefix: '/api' });
    await fastify.register(createVote, { prefix: '/api' });
    await fastify.register(results, { prefix: '/api' });
    return fastify;
};

const start = async (): Promise<void> => {
    const fastify = await buildServer();

    try {
        await fastify.listen(process.env.PORT ?? 4000, '0.0.0.0');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

void start();
