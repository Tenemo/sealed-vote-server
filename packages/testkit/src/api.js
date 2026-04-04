import { POLL_ROUTES, } from '@sealed-vote/contracts';
export const getUniquePollName = (baseName) => {
    const randomHex = Math.random().toString(16).slice(2, 10);
    return `${baseName ?? 'Test-poll'}-${Date.now()}-${randomHex}`;
};
export const createPoll = async (fastify, pollName, choices) => {
    const createResponse = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.create,
        payload: {
            choices: choices ?? ['Option 1', 'Option 2'],
            pollName: pollName ?? `Test poll ${getUniquePollName()}`,
            maxParticipants: 10,
        },
    });
    const createResponseBody = JSON.parse(createResponse.body);
    return {
        pollName: createResponseBody.pollName,
        choices: createResponseBody.choices,
        pollId: createResponseBody.id,
        creatorToken: createResponseBody.creatorToken,
    };
};
export const deletePoll = async (fastify, pollId, creatorToken) => {
    const response = await fastify.inject({
        method: 'DELETE',
        url: POLL_ROUTES.remove(pollId),
        payload: {
            creatorToken,
        },
    });
    if (response.statusCode === 200) {
        return { success: true };
    }
    const responseBody = JSON.parse(response.body);
    return { success: false, message: responseBody.message };
};
export const registerVoter = async (fastify, pollId, voterName) => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.register(pollId),
        payload: {
            voterName,
        },
    });
    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body);
        return { success: true, ...responseBody };
    }
    const responseBody = JSON.parse(response.body);
    return { success: false, message: responseBody.message };
};
export const closePoll = async (fastify, pollId, creatorToken) => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.close(pollId),
        payload: {
            creatorToken,
        },
    });
    if (response.statusCode === 200) {
        return { success: true };
    }
    const responseBody = JSON.parse(response.body);
    return { success: false, message: responseBody.message };
};
export const publicKeyShare = async (fastify, pollId, payload) => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.publicKeyShare(pollId),
        payload,
    });
    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body);
        return { success: true, message: responseBody.message };
    }
    const responseBody = JSON.parse(response.body);
    return { success: false, message: responseBody.message };
};
export const vote = async (fastify, pollId, payload) => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.vote(pollId),
        payload,
    });
    if (response.statusCode === 200) {
        return { success: true, message: response.body };
    }
    const responseBody = JSON.parse(response.body);
    return { success: false, message: responseBody.message };
};
export const decryptionShares = async (fastify, pollId, payload) => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.decryptionShares(pollId),
        payload,
    });
    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body);
        return { success: true, message: responseBody.message };
    }
    const responseBody = JSON.parse(response.body);
    return { success: false, message: responseBody.message };
};
