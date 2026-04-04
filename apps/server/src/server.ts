import { config } from 'dotenv';

import { buildServer } from './buildServer';
import { getDatabaseUrl } from './config';

config();

const start = async (): Promise<void> => {
    const fastify = await buildServer();

    try {
        await fastify.listen(process.env.PORT ?? 4000, '0.0.0.0');
        fastify.log.info('Server started successfully.');

        const dbClient = await fastify.pg.connect();
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
