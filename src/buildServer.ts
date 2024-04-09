import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';
import FastifyPostgres from '@fastify/postgres';
import { config } from 'dotenv';

import { healthCheck } from './routes/health-check';
import { vote } from './routes/vote';
import { create } from './routes/create';
import { fetch } from './routes/fetch';
import { deletePoll } from './routes/delete';
import { register } from './routes/register';
import { close } from './routes/close';
import { publicKeyShare } from './routes/publicKeyShare';
import { IncomingMessage, Server, ServerResponse } from 'http';

config();

const dbConnectionString =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/sv-db';

const TIMEOUT = 30 * 1000;

const logger = {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: {
        target: 'pino-pretty',
    },
};

export const buildServer = async (
    isLoggingEnabled: boolean = false,
): Promise<
    FastifyInstance<
        Server<typeof IncomingMessage, typeof ServerResponse>,
        IncomingMessage,
        ServerResponse<IncomingMessage>,
        FastifyBaseLogger,
        FastifyTypeProviderDefault
    >
> => {
    if (!isLoggingEnabled) {
        isLoggingEnabled = process.env.NODE_ENV !== 'test';
    }
    const fastify = Fastify({
        logger: isLoggingEnabled ? logger : false,
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
    await fastify.register(healthCheck, { prefix: '/api' });
    await fastify.register(vote, { prefix: '/api' });
    await fastify.register(create, { prefix: '/api' });
    await fastify.register(fetch, { prefix: '/api' });
    await fastify.register(deletePoll, { prefix: '/api' });
    await fastify.register(register, { prefix: '/api' });
    await fastify.register(close, { prefix: '/api' });
    await fastify.register(publicKeyShare, { prefix: '/api' });
    return fastify;
};
