export const DEFAULT_DATABASE_URL =
    'postgres://postgres:postgres@localhost:5432/sv-db';

export const getDatabaseUrl = (): string =>
    process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

export const shouldUseDatabaseSsl = (databaseUrl: string): boolean =>
    !databaseUrl.includes('localhost') &&
    !databaseUrl.includes('127.0.0.1') &&
    process.env.NODE_ENV !== 'development' &&
    process.env.NODE_ENV !== 'test';
