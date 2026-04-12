import { randomBytes } from 'node:crypto';

import { POLL_ROUTES } from '@sealed-vote/contracts';
import type {
    BoardMessageRecord,
    BoardMessageRequest,
    BoardMessagesResponse,
    CreatePollResponse,
    MessageResponse,
    PollResponse,
    RegisterVoterResponse,
} from '@sealed-vote/contracts';
import type { FastifyInstance } from 'fastify';
import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
} from 'threshold-elgamal';

export const getUniquePollName = (baseName?: string): string =>
    `${baseName ?? 'Test poll'}-${randomBytes(8).toString('hex')}`;

export const generateClientToken = (): string =>
    randomBytes(32).toString('hex');

export const createPoll = async (
    fastify: FastifyInstance,
    pollName?: string,
    choices?: string[],
): Promise<{
    pollId: string;
    pollSlug: string;
    creatorToken: string;
    pollName: string;
    choices: string[];
}> => {
    const requestedChoices = choices ?? ['Option 1', 'Option 2'];
    const requestedPollName = pollName ?? getUniquePollName();
    const creatorToken = generateClientToken();
    const createResponse = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.create,
        payload: {
            choices: requestedChoices,
            creatorToken,
            pollName: requestedPollName,
        },
    });
    const createResponseBody = JSON.parse(
        createResponse.body,
    ) as CreatePollResponse;

    return {
        pollName: requestedPollName.trim(),
        choices: requestedChoices.map((choice) => choice.trim()),
        pollId: createResponseBody.id,
        pollSlug: createResponseBody.slug,
        creatorToken,
    };
};

export const fetchPoll = async (
    fastify: FastifyInstance,
    pollRef: string,
): Promise<PollResponse> => {
    const response = await fastify.inject({
        method: 'GET',
        url: POLL_ROUTES.poll(pollRef),
    });

    return JSON.parse(response.body) as PollResponse;
};

export const fetchBoardMessages = async (
    fastify: FastifyInstance,
    pollId: string,
): Promise<BoardMessagesResponse> => {
    const response = await fastify.inject({
        method: 'GET',
        url: POLL_ROUTES.boardMessages(pollId),
    });

    return JSON.parse(response.body) as BoardMessagesResponse;
};

export const postBoardMessage = async (
    fastify: FastifyInstance,
    pollId: string,
    payload: BoardMessageRequest,
): Promise<
    | { success: true; record: BoardMessageRecord }
    | { success: false; message?: string }
> => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.boardMessages(pollId),
        payload,
    });

    if (response.statusCode === 201) {
        return {
            success: true,
            record: JSON.parse(response.body) as BoardMessageRecord,
        };
    }

    const responseBody = JSON.parse(response.body) as MessageResponse;
    return { success: false, message: responseBody.message };
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
    | ({
          success: true;
          authKeyPair: CryptoKeyPair;
          transportKeyPair: Awaited<
              ReturnType<typeof generateTransportKeyPair>
          >;
      } & RegisterVoterResponse)
    | { success: false; message?: string }
> => {
    const voterToken = generateClientToken();
    const authKeyPair = await generateAuthKeyPair();
    const transportKeyPair = await generateTransportKeyPair();
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.register(pollId),
        payload: {
            authPublicKey: await exportAuthPublicKey(authKeyPair.publicKey),
            transportPublicKey: await exportTransportPublicKey(
                transportKeyPair.publicKey,
            ),
            transportSuite: transportKeyPair.suite,
            voterName,
            voterToken,
        },
    });

    if (response.statusCode === 201) {
        const responseBody = JSON.parse(response.body) as RegisterVoterResponse;
        return {
            success: true,
            authKeyPair,
            transportKeyPair,
            ...responseBody,
        };
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

export const restartPollCeremony = async (
    fastify: FastifyInstance,
    pollId: string,
    creatorToken: string,
): Promise<{ success: boolean; message?: string }> => {
    const response = await fastify.inject({
        method: 'POST',
        url: POLL_ROUTES.restartCeremony(pollId),
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
