import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { getDatabaseUrl, shouldUseDatabaseSsl } from '../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlDirectory = path.resolve(__dirname, '../sql');
const databaseConnectAttempts = 30;
const databaseConnectDelayMs = 1_000;

const connectWithRetry = async (databaseUrl: string): Promise<Client> => {
    const ssl = shouldUseDatabaseSsl(databaseUrl)
        ? {
              rejectUnauthorized: false,
          }
        : false;
    let lastError: unknown;

    for (let attempt = 1; attempt <= databaseConnectAttempts; attempt += 1) {
        const client = new Client({
            connectionString: databaseUrl,
            ssl,
        });

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

    throw new Error(
        `Failed to connect to the database after ${databaseConnectAttempts} attempts.`,
        {
            cause: lastError,
        },
    );
};

export const resetDatabase = async (): Promise<void> => {
    const databaseUrl = getDatabaseUrl();
    const client = await connectWithRetry(databaseUrl);

    try {
        const dropSql = await readFile(
            path.join(sqlDirectory, 'drop.sql'),
            'utf-8',
        );
        const createSql = await readFile(
            path.join(sqlDirectory, 'create.sql'),
            'utf-8',
        );

        await client.query(dropSql);
        await client.query(createSql);
    } finally {
        await client.end();
    }
};
