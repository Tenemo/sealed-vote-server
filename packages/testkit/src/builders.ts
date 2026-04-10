import type { PollResponse } from '@sealed-vote/contracts';
import type { FastifyInstance } from 'fastify';

import {
    closePoll,
    createPoll,
    fetchBoardMessages,
    fetchPoll,
    postBoardMessage,
    registerVoter,
} from './api.js';

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
