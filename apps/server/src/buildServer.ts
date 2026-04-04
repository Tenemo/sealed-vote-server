import { IncomingMessage, Server, ServerResponse } from 'http';

import { config } from 'dotenv';
import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';

import { databasePlugin } from './db/plugin.js';
import { close } from './routes/close.js';
import { create } from './routes/create.js';
import { decryptionShares } from './routes/decryptionShares.js';
import { deletePoll } from './routes/delete.js';
import { fetch } from './routes/fetch.js';
import { healthCheck } from './routes/health-check.js';
import { publicKeyShare } from './routes/publicKeyShare.js';
import { register } from './routes/register.js';
import { vote } from './routes/vote.js';

config();

const logger = {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: {
        target: 'pino-pretty',
    },
};

export const buildServer = async (
    isLoggingEnabled?: boolean,
): Promise<
    FastifyInstance<
        Server<typeof IncomingMessage, typeof ServerResponse>,
        IncomingMessage,
        ServerResponse<IncomingMessage>,
        FastifyBaseLogger,
        FastifyTypeProviderDefault
    >
> => {
    const shouldEnableLogging =
        isLoggingEnabled ?? process.env.NODE_ENV !== 'test';
    const fastify = Fastify({
        logger: shouldEnableLogging ? logger : false,
    });
    await databasePlugin(fastify);
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
