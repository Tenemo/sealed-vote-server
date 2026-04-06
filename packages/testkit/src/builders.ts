import type { PollResponse } from '@sealed-vote/contracts';
import {
    createDecryptionSharesForTallies,
    serializeVotes,
} from '@sealed-vote/protocol';
import type { FastifyInstance } from 'fastify';
import { generateKeys } from 'threshold-elgamal';

import {
    closePoll,
    createPoll,
    decryptionShares,
    fetchPoll,
    publicKeyShare,
    registerVoter,
    vote,
} from './api.js';
import {
    createScoreMatrix,
    DEFAULT_TEST_CHOICES,
    DEFAULT_TEST_VOTERS,
    type ScoreMatrix,
} from './fixtures.js';

export type TestPollVoter = {
    voterName: string;
    voterIndex: number;
    voterToken: string;
    publicKey?: string;
    privateKey?: string;
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

    private choices: string[] = [...DEFAULT_TEST_CHOICES];

    private voterNames: string[] = DEFAULT_TEST_VOTERS.slice(0, 2);

    private maxParticipants = 10;

    private scoreMatrix: ScoreMatrix | null = null;

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

    public withMaxParticipants(maxParticipants: number): TestPollBuilder {
        this.maxParticipants = maxParticipants;
        return this;
    }

    public withScoreMatrix(scoreMatrix: ScoreMatrix): TestPollBuilder {
        this.scoreMatrix = scoreMatrix;
        return this;
    }

    public async create(): Promise<TestPollBuilder> {
        const created = await createPoll(
            this.fastify,
            this.pollName,
            this.choices,
            this.maxParticipants,
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

    public async submitPublicKeyShares(): Promise<TestPollBuilder> {
        const context = await this.ensureContextWithVoters();
        const threshold = context.voters.length;

        for (const voter of context.voters) {
            const keys = generateKeys(voter.voterIndex, threshold);
            voter.publicKey = keys.publicKey.toString();
            voter.privateKey = keys.privateKey.toString();

            const result = await publicKeyShare(this.fastify, context.pollId, {
                publicKeyShare: voter.publicKey,
                voterToken: voter.voterToken,
            });
            if (!result.success) {
                throw new Error(
                    result.message ??
                        `Failed to submit public key share for "${voter.voterName}".`,
                );
            }
        }

        await this.refreshPoll();
        return this;
    }

    public async submitVotes(): Promise<TestPollBuilder> {
        const context = await this.ensureContextWithPoll();
        const commonPublicKey = context.poll.commonPublicKey;

        if (!commonPublicKey) {
            throw new Error('Common public key is missing.');
        }

        const scoreMatrix =
            this.scoreMatrix ??
            createScoreMatrix(
                context.choices,
                context.voters.map((voter) => voter.voterName),
            );

        for (const voter of context.voters) {
            const encryptedVotes = serializeVotes(
                scoreMatrix[voter.voterName],
                context.choices,
                BigInt(commonPublicKey),
            );
            const result = await vote(this.fastify, context.pollId, {
                votes: encryptedVotes,
                voterToken: voter.voterToken,
            });
            if (!result.success) {
                throw new Error(
                    result.message ??
                        `Failed to submit encrypted votes for "${voter.voterName}".`,
                );
            }
        }

        await this.refreshPoll();
        return this;
    }

    public async submitDecryptionShares(): Promise<TestPollBuilder> {
        const context = await this.ensureContextWithPoll();
        if (context.poll.encryptedTallies.length === 0) {
            throw new Error('Encrypted tallies are missing.');
        }

        for (const voter of context.voters) {
            if (!voter.privateKey) {
                throw new Error(
                    `Private key is missing for "${voter.voterName}".`,
                );
            }
            const voterShares = createDecryptionSharesForTallies(
                context.poll.encryptedTallies,
                BigInt(voter.privateKey),
            );
            const result = await decryptionShares(
                this.fastify,
                context.pollId,
                {
                    decryptionShares: voterShares,
                    voterToken: voter.voterToken,
                },
            );
            if (!result.success) {
                throw new Error(
                    result.message ??
                        `Failed to submit decryption shares for "${voter.voterName}".`,
                );
            }
        }

        await this.refreshPoll();
        return this;
    }

    public async complete(): Promise<TestPollContext> {
        if (!this.context) {
            await this.create();
        }
        if (this.context!.voters.length === 0) {
            await this.registerVoters();
        }

        await this.close();
        await this.submitPublicKeyShares();
        await this.submitVotes();
        await this.submitDecryptionShares();

        return this.getContext();
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

    private async ensureContextWithPoll(): Promise<
        TestPollContext & { poll: PollResponse }
    > {
        const context = await this.ensureContextWithVoters();
        if (!context.poll) {
            throw new Error('Poll state is missing.');
        }

        return context as TestPollContext & { poll: PollResponse };
    }

    private async refreshPoll(): Promise<PollResponse> {
        const context = this.getContext();
        context.poll = await fetchPoll(this.fastify, context.pollId);
        return context.poll;
    }
}
