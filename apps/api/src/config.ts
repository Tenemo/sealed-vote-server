export const DEFAULT_DATABASE_URL =
    'postgres://postgres:postgres@localhost:5432/sv-db';

const LOCAL_DATABASE_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const DISABLED_SSL_NODE_ENVS = new Set(['development', 'test']);

export const getDatabaseUrl = (): string =>
    process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

export const isDefaultDatabaseUrl = (
    databaseUrl: string = getDatabaseUrl(),
): boolean => databaseUrl === DEFAULT_DATABASE_URL;

const isLocalDatabaseUrl = (databaseUrl: string): boolean => {
    try {
        return LOCAL_DATABASE_HOSTNAMES.has(new URL(databaseUrl).hostname);
    } catch {
        return (
            databaseUrl.includes('localhost') ||
            databaseUrl.includes('127.0.0.1')
        );
    }
};

const getDatabaseSslMode = (): 'auto' | boolean => {
    const rawMode = process.env.DATABASE_SSL?.trim().toLowerCase() ?? 'auto';

    if (rawMode === 'auto') {
        return 'auto';
    }

    if (rawMode === 'true') {
        return true;
    }

    if (rawMode === 'false') {
        return false;
    }

    throw new TypeError('DATABASE_SSL must be one of: auto, true, false.');
};

export const shouldUseDatabaseSsl = (databaseUrl: string): boolean => {
    const databaseSslMode = getDatabaseSslMode();

    if (databaseSslMode !== 'auto') {
        return databaseSslMode;
    }

    return (
        !isLocalDatabaseUrl(databaseUrl) &&
        !DISABLED_SSL_NODE_ENVS.has(process.env.NODE_ENV ?? '')
    );
};
