import { config } from 'dotenv';

import { buildServer } from './buildServer';

config();

const dbConnectionString =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@localhost:5432/sv-db';

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
