import { IncomingMessage, Server, ServerResponse } from 'http';

import FastifyPostgres from '@fastify/postgres';
import { config } from 'dotenv';
import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';

import { getDatabaseUrl, shouldUseDatabaseSsl } from './config';
import { close } from './routes/close';
import { create } from './routes/create';
import { decryptionShares } from './routes/decryptionShares';
import { deletePoll } from './routes/delete';
import { fetch } from './routes/fetch';
import { healthCheck } from './routes/health-check';
import { publicKeyShare } from './routes/publicKeyShare';
import { register } from './routes/register';
import { vote } from './routes/vote';

config();

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
    const databaseUrl = getDatabaseUrl();
    const fastify = Fastify({
        logger: isLoggingEnabled ? logger : false,
    });
    await fastify.register(FastifyPostgres, {
        connectionString: databaseUrl,
        ssl: shouldUseDatabaseSsl(databaseUrl)
            ? {
                  rejectUnauthorized: false,
              }
            : false,
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
    await fastify.register(decryptionShares, { prefix: '/api' });
    return fastify;
};
