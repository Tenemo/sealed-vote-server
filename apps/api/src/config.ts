export const DEFAULT_DATABASE_URL =
    'postgres://postgres:postgres@localhost:5432/sv-db';

const LOCAL_DATABASE_HOSTNAMES = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    'postgres',
]);

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
            databaseUrl.includes('127.0.0.1') ||
            databaseUrl.includes('::1') ||
            databaseUrl.includes('@postgres:')
        );
    }
};

export const shouldUseDatabaseSsl = (databaseUrl: string): boolean =>
    !isLocalDatabaseUrl(databaseUrl);

export const getConfiguredWebAppOrigin = (): string | null => {
    const configuredOrigin = process.env.WEB_APP_ORIGIN?.trim();

    if (!configuredOrigin) {
        return null;
    }

    let parsedOrigin: URL;

    try {
        parsedOrigin = new URL(configuredOrigin);
    } catch {
        throw new TypeError('WEB_APP_ORIGIN must be a valid absolute URL.');
    }

    if (
        parsedOrigin.protocol !== 'http:' &&
        parsedOrigin.protocol !== 'https:'
    ) {
        throw new TypeError('WEB_APP_ORIGIN must use http or https.');
    }

    return parsedOrigin.origin;
};
