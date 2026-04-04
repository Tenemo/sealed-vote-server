import { IncomingMessage, Server, ServerResponse } from 'http';

import { config } from 'dotenv';
import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';

import { databasePlugin } from './db/plugin';
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
