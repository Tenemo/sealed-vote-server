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

export type TestPollVoter = {
    voterName: string;
    voterIndex: number;
    voterToken: string;
};

export type TestPollContext = {
    pollId: string;
    pollSlug: string;
    creatorToken: string;
    pollName: string;
    choices: string[];
    voters: TestPollVoter[];
    poll: PollResponse | null;
};

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
        url: POLL_ROUTES.createPoll,
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
    pollReference: string,
): Promise<PollResponse> => {
    const response = await fastify.inject({
        method: 'GET',
        url: POLL_ROUTES.fetchPoll(pollReference),
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
        url: POLL_ROUTES.deletePoll(pollId),
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
        url: POLL_ROUTES.registerVoter(pollId),
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
        url: POLL_ROUTES.closeVoting(pollId),
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

export class TestPollBuilder {
    private pollName: string | undefined;

    private choices: string[] = ['Option 1', 'Option 2'];

    private voterNames: string[] = ['Alice', 'Bob', 'Charlie'];

    private context: TestPollContext | null = null;

    public constructor(private readonly fastify: FastifyInstance) {}

    public withPollName(pollName: string): TestPollBuilder {
        this.pollName = pollName;
        return this;
    }

    public withChoices(choices: string[]): TestPollBuilder {
        this.choices = [...choices];
        return this;
    }

    public withVoters(voterNames: string[]): TestPollBuilder {
        this.voterNames = [...voterNames];
        return this;
    }

    public async create(): Promise<TestPollBuilder> {
        const created = await createPoll(
            this.fastify,
            this.pollName,
            this.choices,
        );

        this.context = {
            ...created,
            voters: [],
            poll: await fetchPoll(this.fastify, created.pollId),
        };

        return this;
    }

    public async registerVoters(): Promise<TestPollBuilder> {
        const context = await this.ensureContext();

        for (const voterName of this.voterNames) {
            const registeredVoter = await registerVoter(
                this.fastify,
                context.pollId,
                voterName,
            );

            if (!registeredVoter.success) {
                throw new Error(
                    registeredVoter.message ??
                        `Failed to register voter "${voterName}".`,
                );
            }

            context.voters.push({
                voterName: registeredVoter.voterName,
                voterIndex: registeredVoter.voterIndex,
                voterToken: registeredVoter.voterToken,
            });
        }

        await this.refreshPoll();
        return this;
    }

    public async close(): Promise<TestPollBuilder> {
        const context = await this.ensureContext();
        const closeResult = await closePoll(
            this.fastify,
            context.pollId,
            context.creatorToken,
        );

        if (!closeResult.success) {
            throw new Error(closeResult.message ?? 'Failed to close poll.');
        }

        await this.refreshPoll();
        return this;
    }

    public async fetchBoardMessages(): Promise<
        ReturnType<typeof fetchBoardMessages>
    > {
        const context = await this.ensureContext();
        return fetchBoardMessages(this.fastify, context.pollId);
    }

    public async postBoardMessage(
        voterIndex: number,
        signedPayload: Parameters<typeof postBoardMessage>[2]['signedPayload'],
    ): Promise<void> {
        const context = await this.ensureContextWithVoters();
        const voter = context.voters.find(
            (entry) => entry.voterIndex === voterIndex,
        );

        if (!voter) {
            throw new Error(`Missing voter ${voterIndex}.`);
        }

        const response = await postBoardMessage(this.fastify, context.pollId, {
            voterToken: voter.voterToken,
            signedPayload,
        });

        if (!response.success) {
            throw new Error(
                response.message ??
                    `Failed to post board message for participant ${voterIndex}.`,
            );
        }

        await this.refreshPoll();
    }

    public getContext(): TestPollContext {
        if (!this.context) {
            throw new Error('Test poll has not been created yet.');
        }

        return this.context;
    }

    private async ensureContext(): Promise<TestPollContext> {
        if (!this.context) {
            await this.create();
        }

        return this.getContext();
    }

    private async ensureContextWithVoters(): Promise<TestPollContext> {
        const context = await this.ensureContext();

        if (context.voters.length === 0) {
            throw new Error('No registered voters are available.');
        }

        return context;
    }

    private async refreshPoll(): Promise<PollResponse> {
        const context = this.getContext();
        context.poll = await fetchPoll(this.fastify, context.pollId);
        return context.poll;
    }
}
