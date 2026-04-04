import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { getDatabaseUrl, shouldUseDatabaseSsl } from '../config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlDirectory = path.resolve(__dirname, '../sql');

export const resetDatabase = async (): Promise<void> => {
    const databaseUrl = getDatabaseUrl();
    const client = new Client({
        connectionString: databaseUrl,
        ssl: shouldUseDatabaseSsl(databaseUrl)
            ? {
                  rejectUnauthorized: false,
              }
            : false,
    });

    await client.connect();

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
