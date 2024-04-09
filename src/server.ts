import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';
import FastifyPostgres from '@fastify/postgres';
import dotenv from 'dotenv';

import vote from 'routes/polls/vote';
import createVote from 'routes/polls/create';
import results from 'routes/polls/fetch';
import healthCheck from 'routes/health-check';
import { IncomingMessage, Server, ServerResponse } from 'http';

dotenv.config();

const dbConnectionString =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/sv-db';

const TIMEOUT = 30 * 1000;

const buildServer = async (): Promise<
    FastifyInstance<
        Server<typeof IncomingMessage, typeof ServerResponse>,
        IncomingMessage,
        ServerResponse<IncomingMessage>,
        FastifyBaseLogger,
        FastifyTypeProviderDefault
    >
> => {
    const fastify = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            transport: {
                target: 'pino-pretty',
            },
        },
    });
    await fastify.register(FastifyPostgres, {
        connectionString: dbConnectionString,
        ssl:
            process.env.NODE_ENV === 'development'
                ? false
                : {
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
    await fastify.register(healthCheck, { prefix: '/api' });
    return fastify;
};

const start = async (): Promise<void> => {
    const fastify = await buildServer();

    try {
        await fastify.listen(process.env.PORT ?? 4000, '0.0.0.0');
        fastify.log.info('Server started successfully.');
        fastify.log.info(`Connected to database: ${dbConnectionString}`);

        const dbClient = await fastify.pg.connect();
        dbClient.release();
        fastify.log.info('Database connection successful.');
    } catch (err) {
        if (err instanceof Error) {
            fastify.log.error(`Server start error: ${err.message}`);
        }
        process.exit(1);
    }
};

void start();
