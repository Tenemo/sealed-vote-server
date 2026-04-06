import { POLL_ROUTES } from '@sealed-vote/contracts';
import type {
    CreatePollResponse,
    DecryptionSharesRequest,
    MessageResponse,
    PollResponse,
    PublicKeyShareRequest,
    RegisterVoterResponse,
    VoteRequest,
} from '@sealed-vote/contracts';
import type { FastifyInstance } from 'fastify';

export const getUniquePollName = (baseName?: string): string => {
    const randomHex = Math.random().toString(16).slice(2, 10);
    return `${baseName ?? 'Test-poll'}-${Date.now()}-${randomHex}`;
};

export const createPoll = async (
    fastify: FastifyInstance,
    pollName?: string,
    choices?: string[],
    maxParticipants: number = 10,
): Promise<{
    pollId: string;
    creatorToken: string;
    pollName: string;
    choices: string[];
}> => {
    const requestedChoices = choices ?? ['Option 1', 'Option 2'];
    const requestedPollName = pollName ?? `Test poll ${getUniquePollName()}`;
    const createResponse = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.create,
        payload: {
            choices: requestedChoices,
            pollName: requestedPollName,
            maxParticipants,
        },
    });
    const createResponseBody = JSON.parse(
        createResponse.body,
    ) as CreatePollResponse;
    return {
        pollName: requestedPollName.trim(),
        choices: requestedChoices.map((choice) => choice.trim()),
        pollId: createResponseBody.id,
        creatorToken: createResponseBody.creatorToken,
    };
};

export const fetchPoll = async (
    fastify: FastifyInstance,
    pollId: string,
): Promise<PollResponse> => {
    const response = await fastify.inject({
        method: 'GET',
        url: POLL_ROUTES.poll(pollId),
    });

    return JSON.parse(response.body) as PollResponse;
};

export const deletePoll = async (
    fastify: FastifyInstance,
    pollId: string,
    creatorToken: string,
): Promise<{ success: boolean; message?: string }> => {
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

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
};

export const registerVoter = async (
    fastify: FastifyInstance,
    pollId: string,
    voterName: string,
): Promise<
    | ({ success: true } & RegisterVoterResponse)
    | { success: false; message?: string }
> => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.register(pollId),
        payload: {
            voterName,
        },
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body) as RegisterVoterResponse;
        return { success: true, ...responseBody };
    }

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
};

export const closePoll = async (
    fastify: FastifyInstance,
    pollId: string,
    creatorToken: string,
): Promise<{ success: boolean; message?: string }> => {
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

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
};

export const publicKeyShare = async (
    fastify: FastifyInstance,
    pollId: string,
    payload: PublicKeyShareRequest,
): Promise<{ success: boolean; message?: string }> => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.publicKeyShare(pollId),
        payload,
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body) as MessageResponse;
        return { success: true, message: responseBody.message };
    }

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
};

export const vote = async (
    fastify: FastifyInstance,
    pollId: string,
    payload: VoteRequest,
): Promise<{ success: boolean; message?: string }> => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.vote(pollId),
        payload,
    });

    if (response.statusCode === 200) {
        return { success: true, message: response.body };
    }

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
};

export const decryptionShares = async (
    fastify: FastifyInstance,
    pollId: string,
    payload: DecryptionSharesRequest,
): Promise<{ success: boolean; message?: string }> => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.decryptionShares(pollId),
        payload,
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body) as MessageResponse;
        return { success: true, message: responseBody.message };
    }

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
};
