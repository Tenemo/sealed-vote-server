import type { FastifyInstance } from 'fastify';
import type { CreatePollResponse } from 'routes/polls/create';

export const getUniquePollName = (baseName?: string): string =>
    `${baseName ?? 'Test-poll'}-${Date.now()}`;

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
            pollName: pollName ?? `Test poll ${Date.now()}`,
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
