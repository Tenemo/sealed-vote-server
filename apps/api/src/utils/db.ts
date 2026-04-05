import type { FastifyInstance } from 'fastify';

import type { DatabaseTransaction } from '../db/client.js';

type DatabaseErrorLike = {
    code?: string;
    constraint?: string;
    cause?: unknown;
};

const getDatabaseErrorLike = (error: unknown): DatabaseErrorLike | null => {
    if (!error || typeof error !== 'object') {
        return null;
    }

    const databaseError = error as DatabaseErrorLike;
    if (typeof databaseError.code === 'string') {
        return databaseError;
    }

    if (databaseError.cause && typeof databaseError.cause === 'object') {
        const nestedError = databaseError.cause as DatabaseErrorLike;
        if (typeof nestedError.code === 'string') {
            return nestedError;
        }
    }

    return databaseError;
};

export const withTransaction = async <T>(
    fastify: FastifyInstance,
    handler: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> => {
    return fastify.db.transaction(async (tx) =>
        handler(tx as DatabaseTransaction),
    );
};

export const isConstraintViolation = (
    error: unknown,
    constraint?: string,
): error is DatabaseErrorLike => {
    const databaseError = getDatabaseErrorLike(error);
    if (!databaseError) {
        return false;
    }

    if (databaseError.code !== '23505') {
        return false;
    }

    return constraint ? databaseError.constraint === constraint : true;
};

export const normalizeDatabaseTimestamp = (value: Date | string): string =>
    value instanceof Date ? value.toISOString() : value;
