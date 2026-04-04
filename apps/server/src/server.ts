import { config } from 'dotenv';

import { buildServer } from './buildServer';
import { getDatabaseUrl } from './config';

config();

const start = async (): Promise<void> => {
    const fastify = await buildServer();
    const port = Number.parseInt(process.env.PORT ?? '4000', 10);

    try {
        if (Number.isNaN(port)) {
            throw new TypeError('PORT must be a valid integer.');
        }

        await fastify.listen({ port, host: '0.0.0.0' });
        fastify.log.info('Server started successfully.');

        const dbClient = await fastify.pgPool.connect();
        dbClient.release();
        fastify.log.info(
            `Database connection successful for ${getDatabaseUrl().includes('localhost') ? 'local' : 'configured'} database.`,
        );
    } catch (err) {
        if (err instanceof Error) {
            fastify.log.error(`Server start error: ${err.message}`);
        }
        process.exit(1);
    }
};

void start();
