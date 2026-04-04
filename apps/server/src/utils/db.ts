import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';

type DatabaseErrorLike = {
    code?: string;
    constraint?: string;
};

export const withTransaction = async <T>(
    fastify: FastifyInstance,
    handler: (client: PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await fastify.pg.connect();

    try {
        await client.query('BEGIN');
        const result = await handler(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const isConstraintViolation = (
    error: unknown,
    constraint?: string,
): error is DatabaseErrorLike => {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const databaseError = error as DatabaseErrorLike;
    if (databaseError.code !== '23505') {
        return false;
    }

    return constraint ? databaseError.constraint === constraint : true;
};
