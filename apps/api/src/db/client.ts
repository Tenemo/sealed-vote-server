import type { ExtractTablesWithRelations } from 'drizzle-orm';
import {
    drizzle,
    type NodePgDatabase,
    type NodePgTransaction,
} from 'drizzle-orm/node-postgres';
import { Client, Pool, type PoolConfig } from 'pg';

import { getDatabaseUrl, shouldUseDatabaseSsl } from '../config.js';

import { schema, type DatabaseSchema } from './schema.js';

const TIMEOUT = 30 * 1000;

export type Database = NodePgDatabase<DatabaseSchema>;
export type DatabaseTransaction = NodePgTransaction<
    DatabaseSchema,
    ExtractTablesWithRelations<DatabaseSchema>
>;

const getDatabaseSslConfig = (databaseUrl: string): PoolConfig['ssl'] =>
    shouldUseDatabaseSsl(databaseUrl)
        ? {
              rejectUnauthorized: false,
          }
        : false;

export const createDatabaseConnectionConfig = (
    databaseUrl: string = getDatabaseUrl(),
): PoolConfig => ({
    connectionString: databaseUrl,
    ssl: getDatabaseSslConfig(databaseUrl),
    statement_timeout: TIMEOUT,
    query_timeout: TIMEOUT,
    idle_in_transaction_session_timeout: TIMEOUT,
    connectionTimeoutMillis: TIMEOUT,
});

export const createDatabasePool = (
    databaseUrl: string = getDatabaseUrl(),
): Pool => new Pool(createDatabaseConnectionConfig(databaseUrl));

export const createDatabaseClient = (
    databaseUrl: string = getDatabaseUrl(),
): Client => new Client(createDatabaseConnectionConfig(databaseUrl));

export const createDatabase = (pool: Pool): Database =>
    drizzle(pool, { schema });
