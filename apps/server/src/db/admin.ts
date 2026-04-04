import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Client } from 'pg';

import { getDatabaseUrl } from '../config.js';

import {
    createDatabase,
    createDatabaseClient,
    createDatabasePool,
} from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../../drizzle');
const databaseConnectAttempts = 30;
const databaseConnectDelayMs = 1_000;

const connectWithRetry = async (databaseUrl: string): Promise<Client> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= databaseConnectAttempts; attempt += 1) {
        const client = createDatabaseClient(databaseUrl);

        try {
            await client.connect();
            return client;
        } catch (error) {
            lastError = error;
            await client.end().catch(() => undefined);

            if (attempt === databaseConnectAttempts) {
                break;
            }

            await delay(databaseConnectDelayMs);
        }
    }

    const error = new Error(
        `Failed to connect to the database after ${databaseConnectAttempts} attempts.`,
    ) as Error & { cause?: unknown };
    error.cause = lastError;
    throw error;
};

export const migrateDatabase = async (): Promise<void> => {
    const pool = createDatabasePool();

    try {
        await migrate(createDatabase(pool), {
            migrationsFolder,
        });
    } finally {
        await pool.end();
    }
};

export const resetDatabase = async (): Promise<void> => {
    const databaseUrl = getDatabaseUrl();
    const client = await connectWithRetry(databaseUrl);

    try {
        await client.query('DROP SCHEMA IF EXISTS public CASCADE');
        await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
        await client.query('CREATE SCHEMA public');
        await client.query('GRANT ALL ON SCHEMA public TO public');
    } finally {
        await client.end();
    }

    await migrateDatabase();
};
