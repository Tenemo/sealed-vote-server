import type { FastifyReply, FastifyRequest } from 'fastify';

const dropResponseHeaderName = 'x-sealed-vote-e2e-drop-response';
const dropResponseQueryParamName = '__e2e-drop-response';
const dropResponseHeaderValue = 'after-commit';

const hasExpectedDropResponseHeader = (request: FastifyRequest): boolean => {
    const headerValue = request.headers[dropResponseHeaderName];

    if (Array.isArray(headerValue)) {
        return headerValue.includes(dropResponseHeaderValue);
    }

    return headerValue === dropResponseHeaderValue;
};

export const maybeDropTestResponseAfterCommit = ({
    reply,
    request,
}: {
    reply: FastifyReply;
    request: FastifyRequest;
}): boolean => {
    if (process.env.NODE_ENV !== 'test') {
        return false;
    }

    const requestUrl = new URL(
        request.raw.url ?? request.url,
        'http://localhost',
    );
    const hasExpectedDropResponseQueryParam =
        requestUrl.searchParams.get(dropResponseQueryParamName) ===
        dropResponseHeaderValue;

    if (
        !hasExpectedDropResponseHeader(request) &&
        !hasExpectedDropResponseQueryParam
    ) {
        return false;
    }

    reply.hijack();
    reply.raw.destroy();

    return true;
};

export const e2eDropResponseHeader = {
    name: dropResponseHeaderName,
    value: dropResponseHeaderValue,
} as const;

export const e2eDropResponseQueryParam = {
    name: dropResponseQueryParamName,
    value: dropResponseHeaderValue,
} as const;
