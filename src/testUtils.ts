import type { FastifyInstance } from 'fastify';
import type { CreatePollResponse } from 'routes/create';
import type { RegisterResponse } from 'routes/register';
import type { PublicKeyShareResponse } from 'routes/publicKeyShare';
import type { DecryptionSharesResponse } from 'routes/decryptionShares';

export const getUniquePollName = (baseName?: string): string => {
    const randomHex = Math.random().toString(16).slice(2, 10);
    return `${baseName ?? 'Test-poll'}-${Date.now()}-${randomHex}`;
};

export const createPoll = async (
    fastify: FastifyInstance,
    pollName?: string,
    choices?: string[],
): Promise<{
    pollId: string;
    creatorToken: string;
    pollName: string;
    choices: string[];
}> => {
    const createResponse = await fastify.inject({
        method: 'POST',
        url: 'api/polls/create',
        payload: {
            choices: choices ?? ['Option 1', 'Option 2'],
            pollName: pollName ?? `Test poll ${getUniquePollName()}`,
            maxParticipants: 10,
        },
    });
    const createResponseBody = JSON.parse(
        createResponse.body,
    ) as CreatePollResponse;
    return {
        pollName: createResponseBody.pollName,
        choices: createResponseBody.choices,
        pollId: createResponseBody.id,
        creatorToken: createResponseBody.creatorToken,
    };
};
export const deletePoll = async (
    fastify: FastifyInstance,
    pollId: string,
    creatorToken: string,
): Promise<{ success: boolean; message?: string }> => {
    const response = await fastify.inject({
        method: 'DELETE',
        url: `api/polls/${pollId}`,
        payload: {
            creatorToken,
        },
    });

    if (response.statusCode === 200) {
        return { success: true };
    } else {
        const responseBody = JSON.parse(response.body) as { message: string };
        return { success: false, message: responseBody.message };
    }
};

export const registerVoter = async (
    fastify: FastifyInstance,
    pollId: string,
    voterName: string,
): Promise<{
    success: boolean;
    message?: string;
}> => {
    const response = await fastify.inject({
        method: 'POST',
        url: `/api/polls/${pollId}/register`,
        payload: {
            voterName,
        },
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body) as RegisterResponse;
        return { success: true, message: responseBody.message };
    } else {
        const responseBody = JSON.parse(response.body) as { message: string };
        return { success: false, message: responseBody.message };
    }
};

export const closePoll = async (
    fastify: FastifyInstance,
    pollId: string,
    creatorToken: string,
): Promise<{ success: boolean; message?: string }> => {
    const response = await fastify.inject({
        method: 'POST',
        url: `/api/polls/${pollId}/close`,
        payload: {
            creatorToken,
        },
    });

    if (response.statusCode === 200) {
        return { success: true };
    } else {
        const responseBody = JSON.parse(response.body) as { message: string };
        return { success: false, message: responseBody.message };
    }
};

export const publicKeyShare = async (
    fastify: FastifyInstance,
    pollId: string,
    publicKeyShare: string,
): Promise<{
    success: boolean;
    message?: string;
}> => {
    const response = await fastify.inject({
        method: 'POST',
        url: `/api/polls/${pollId}/public-key-share`,
        payload: {
            publicKeyShare,
        },
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(
            response.body,
        ) as PublicKeyShareResponse;
        return { success: true, message: responseBody.message };
    } else {
        const responseBody = JSON.parse(response.body) as { message: string };
        return { success: false, message: responseBody.message };
    }
};
export const vote = async (
    fastify: FastifyInstance,
    pollId: string,
    votes: Array<{ c1: string; c2: string }>,
): Promise<{
    success: boolean;
    message?: string;
}> => {
    const response = await fastify.inject({
        method: 'POST',
        url: `/api/polls/${pollId}/vote`,
        payload: {
            votes,
        },
    });

    if (response.statusCode === 200) {
        return { success: true, message: 'Vote submitted successfully' };
    } else {
        const responseBody = JSON.parse(response.body) as { message: string };
        return { success: false, message: responseBody.message };
    }
};
export const decryptionShares = async (
    fastify: FastifyInstance,
    pollId: string,
    decryptionShares: string[],
): Promise<{
    success: boolean;
    message?: string;
}> => {
    const response = await fastify.inject({
        method: 'POST',
        url: `/api/polls/${pollId}/decryption-shares`,
        payload: {
            decryptionShares,
        },
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(
            response.body,
        ) as DecryptionSharesResponse;
        return { success: true, message: responseBody.message };
    } else {
        const responseBody = JSON.parse(response.body) as { message: string };
        return { success: false, message: responseBody.message };
    }
};
