import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';
import FastifyPostgres from '@fastify/postgres';
import dotenv from 'dotenv';

import vote from './routes/polls/vote';
import { create } from './routes/polls/create';
import results from './routes/polls/fetch';
import healthCheck from './routes/health-check';
import { IncomingMessage, Server, ServerResponse } from 'http';

dotenv.config();

const dbConnectionString =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/sv-db';

const TIMEOUT = 30 * 1000;

export const buildServer = async (): Promise<
    FastifyInstance<
        Server<typeof IncomingMessage, typeof ServerResponse>,
        IncomingMessage,
        ServerResponse<IncomingMessage>,
        FastifyBaseLogger,
        FastifyTypeProviderDefault
    >
> => {
    const logger =
        process.env.NODE_ENV === 'test'
            ? false
            : {
                  level: process.env.LOG_LEVEL ?? 'info',
                  transport: {
                      target: 'pino-pretty',
                  },
              };
    const fastify = Fastify({
        logger,
    });
    await fastify.register(FastifyPostgres, {
        connectionString: dbConnectionString,
        ssl:
            process.env.NODE_ENV === 'development' ||
            process.env.NODE_ENV === 'test'
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
    await fastify.register(create, { prefix: '/api' });
    await fastify.register(results, { prefix: '/api' });
    await fastify.register(healthCheck, { prefix: '/api' });
    return fastify;
};
