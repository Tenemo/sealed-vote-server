import { IncomingMessage, Server, ServerResponse } from 'http';

import cors from '@fastify/cors';
import { ERROR_MESSAGES } from '@sealed-vote/contracts';
import { config } from 'dotenv';
import Fastify, {
    FastifyBaseLogger,
    FastifyInstance,
    FastifyTypeProviderDefault,
} from 'fastify';

import { getConfiguredWebAppOrigin } from './config.js';
import { databasePlugin } from './db/plugin.js';
import { boardMessageRoutes } from './routes/boardMessages.js';
import { closeVoting } from './routes/close.js';
import { create } from './routes/create.js';
import { deletePoll } from './routes/delete.js';
import { fetch } from './routes/fetch.js';
import { healthCheck } from './routes/health-check.js';
import { recoverSession } from './routes/recoverSession.js';
import { register } from './routes/register.js';
import { restartCeremony } from './routes/restartCeremony.js';

config();

const developmentLogger = {
    level: 'info',
    transport: {
        target: 'pino-pretty',
    },
};
const productionLogger = {
    level: 'info',
};

const allowedProductionOrigins = new Set([
    'https://sealed.vote',
    'https://www.sealed.vote',
]);
const netlifyDeployPreviewOriginPattern =
    /^https:\/\/deploy-preview-\d+--sealed-vote\.netlify\.app$/;

const isAllowedLocalOrigin = (origin: string): boolean => {
    try {
        const url = new URL(origin);
        return (
            url.protocol === 'http:' &&
            (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
        );
    } catch {
        return false;
    }
};

const isAllowedDeployPreviewOrigin = (origin: string): boolean =>
    netlifyDeployPreviewOriginPattern.test(origin);

const isAllowedCorsOrigin = (
    origin: string | undefined,
    configuredWebAppOrigin: string | null,
): boolean =>
    !origin ||
    allowedProductionOrigins.has(origin) ||
    origin === configuredWebAppOrigin ||
    isAllowedDeployPreviewOrigin(origin) ||
    isAllowedLocalOrigin(origin);

type ValidationIssue = {
    instancePath?: string;
    keyword?: string;
    params?: {
        format?: string;
    };
    schemaPath?: string;
};

type ErrorLike = {
    message?: unknown;
    statusCode?: unknown;
    validation?: unknown;
};

const asErrorLike = (error: unknown): ErrorLike | null =>
    typeof error === 'object' && error !== null ? (error as ErrorLike) : null;

const getValidationIssues = (error: unknown): ValidationIssue[] | null => {
    const validation = asErrorLike(error)?.validation;
    return Array.isArray(validation) ? (validation as ValidationIssue[]) : null;
};

const isPollIdValidationError = (error: unknown): boolean => {
    const validation = getValidationIssues(error);

    return (
        !!validation &&
        validation.some(
            (issue) =>
                (issue.instancePath === '/pollId' ||
                    issue.schemaPath?.includes('/pollId/')) &&
                (issue.keyword === 'format' || issue.params?.format === 'uuid'),
        )
    );
};

const getErrorMessage = (error: unknown): string =>
    error instanceof Error
        ? error.message
        : typeof asErrorLike(error)?.message === 'string'
          ? (asErrorLike(error)?.message as string)
          : 'Internal server error';

const getStatusCode = (error: unknown): number | null => {
    const statusCode = asErrorLike(error)?.statusCode;
    return typeof statusCode === 'number' ? statusCode : null;
};

export const buildServer = async (
    isLoggingEnabled?: boolean,
): Promise<
    FastifyInstance<
        Server<typeof IncomingMessage, typeof ServerResponse>,
        IncomingMessage,
        ServerResponse<IncomingMessage>,
        FastifyBaseLogger,
        FastifyTypeProviderDefault
    >
> => {
    const shouldEnableLogging =
        isLoggingEnabled ?? process.env.NODE_ENV !== 'test';
    const configuredWebAppOrigin = getConfiguredWebAppOrigin();
    const fastify = Fastify({
        ajv: {
            customOptions: {
                removeAdditional: false,
            },
        },
        logger: shouldEnableLogging
            ? process.env.NODE_ENV === 'development'
                ? developmentLogger
                : productionLogger
            : false,
    });
    fastify.setErrorHandler((error, _request, reply) => {
        if (isPollIdValidationError(error)) {
            void reply
                .status(400)
                .send({ message: ERROR_MESSAGES.invalidPollId });
            return;
        }

        if (getValidationIssues(error)) {
            void reply.status(400).send({ message: getErrorMessage(error) });
            return;
        }

        const statusCode = getStatusCode(error);
        if (statusCode && statusCode < 500) {
            void reply
                .status(statusCode)
                .send({ message: getErrorMessage(error) });
            return;
        }

        fastify.log.error(error);
        void reply.status(500).send({ message: 'Internal server error' });
    });
    await fastify.register(cors, {
        origin: (origin, callback) => {
            callback(null, isAllowedCorsOrigin(origin, configuredWebAppOrigin));
        },
        methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type'],
        maxAge: 86_400,
    });
    await databasePlugin(fastify);
    await fastify.register(healthCheck, { prefix: '/api' });
    await fastify.register(create, { prefix: '/api' });
    await fastify.register(fetch, { prefix: '/api' });
    await fastify.register(deletePoll, { prefix: '/api' });
    await fastify.register(register, { prefix: '/api' });
    await fastify.register(recoverSession, { prefix: '/api' });
    await fastify.register(closeVoting, { prefix: '/api' });
    await fastify.register(restartCeremony, { prefix: '/api' });
    await fastify.register(boardMessageRoutes, { prefix: '/api' });
    return fastify;
};
