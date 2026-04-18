import { config } from 'dotenv';

import { buildServer } from './build-server.js';
import { getDatabaseUrl, isDefaultDatabaseUrl } from './config.js';

config();

const start = async (): Promise<void> => {
    const fastify = await buildServer();
    const port = Number.parseInt(process.env.PORT ?? '4000', 10);

    try {
        if (Number.isNaN(port)) {
            throw new TypeError('PORT must be a valid integer.');
        }

        await fastify.listen({ host: '::', port });
        fastify.log.info('Server started successfully.');

        const databaseUrl = getDatabaseUrl();
        const dbClient = await fastify.pgPool.connect();
        dbClient.release();
        fastify.log.info(
            `Database connection successful for ${isDefaultDatabaseUrl(databaseUrl) ? 'default' : 'configured'} database.`,
        );
    } catch (err) {
        if (err instanceof Error) {
            fastify.log.error(`Server start error: ${err.message}`);
        }
        process.exit(1);
    }
};

void start();
