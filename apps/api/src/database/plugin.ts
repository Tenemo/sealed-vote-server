import type { FastifyInstance as BaseFastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { createDatabase, createDatabasePool, type Database } from './client.js';

declare module 'fastify' {
    // Fastify decorations require interface merging.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface FastifyInstance {
        database: Database;
        pgPool: Pool;
    }
}

export const databasePlugin = async (
    fastify: BaseFastifyInstance,
): Promise<void> => {
    const pgPool = createDatabasePool();

    fastify.decorate('pgPool', pgPool);
    fastify.decorate('database', createDatabase(pgPool));

    fastify.addHook('onClose', async (instance) => {
        await instance.pgPool.end();
    });
};
