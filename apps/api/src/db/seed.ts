import { TestPollBuilder, type TestPollContext } from '@sealed-vote/testkit';
import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { polls } from './schema.js';

type SeedPhase = 'registration' | 'voting' | 'results';

type SeedManifestVoter = {
    voterName: string;
    voterIndex: number;
    voterToken: string;
};

export type SeedManifestPoll = {
    name: string;
    phase: SeedPhase;
    pollId: string;
    creatorToken: string;
    voters: SeedManifestVoter[];
};

type SeedManifest = {
    generatedAt: string;
    polls: SeedManifestPoll[];
};

const registrationSampleName = 'Seed registration sample';
const votingSampleName = 'Seed voting sample';
const resultsSampleName = 'Seed results sample';
const seedPollNames = [
    registrationSampleName,
    votingSampleName,
    resultsSampleName,
];

const toManifestPoll = (
    name: string,
    phase: SeedPhase,
    context: TestPollContext,
): SeedManifestPoll => ({
    name,
    phase,
    pollId: context.pollId,
    creatorToken: context.creatorToken,
    voters: context.voters.map(({ voterIndex, voterName, voterToken }) => ({
        voterName,
        voterIndex,
        voterToken,
    })),
});

const buildRegistrationSample = async (
    fastify: FastifyInstance,
): Promise<TestPollContext> => {
    const builder = new TestPollBuilder(fastify)
        .withPollName(registrationSampleName)
        .withChoices(['Pizza', 'Sushi', 'Pasta'])
        .withVoters(['Alice', 'Bob']);

    await builder.create();
    await builder.registerVoters();

    return builder.getContext();
};

const buildVotingSample = async (
    fastify: FastifyInstance,
): Promise<TestPollContext> => {
    const builder = new TestPollBuilder(fastify)
        .withPollName(votingSampleName)
        .withChoices(['Dog', 'Cat', 'Goat'])
        .withVoters(['Alice', 'Bob', 'Charlie']);

    await builder.create();
    await builder.registerVoters();
    await builder.close();
    await builder.submitPublicKeyShares();

    return builder.getContext();
};

const buildResultsSample = async (
    fastify: FastifyInstance,
): Promise<TestPollContext> => {
    const builder = new TestPollBuilder(fastify)
        .withPollName(resultsSampleName)
        .withChoices(['Red', 'Green', 'Blue'])
        .withVoters(['Ada', 'Grace', 'Linus'])
        .withScoreMatrix({
            Ada: {
                Red: 2,
                Green: 3,
                Blue: 5,
            },
            Grace: {
                Red: 7,
                Green: 11,
                Blue: 13,
            },
            Linus: {
                Red: 17,
                Green: 19,
                Blue: 23,
            },
        });

    return builder.complete();
};

export const seedDatabase = async (
    fastify: FastifyInstance,
): Promise<SeedManifest> => {
    await fastify.db
        .delete(polls)
        .where(inArray(polls.pollName, seedPollNames));

    const registrationSample = await buildRegistrationSample(fastify);
    const votingSample = await buildVotingSample(fastify);
    const resultsSample = await buildResultsSample(fastify);

    return {
        generatedAt: new Date().toISOString(),
        polls: [
            toManifestPoll(
                registrationSampleName,
                'registration',
                registrationSample,
            ),
            toManifestPoll(votingSampleName, 'voting', votingSample),
            toManifestPoll(resultsSampleName, 'results', resultsSample),
        ],
    };
};

export const formatSeedManifest = (manifest: SeedManifest): string =>
    [
        'Seed manifest',
        `Generated at: ${manifest.generatedAt}`,
        '',
        ...manifest.polls.flatMap((poll) => [
            `${poll.name}`,
            `Phase: ${poll.phase}`,
            `Poll ID: ${poll.pollId}`,
            `Creator token: ${poll.creatorToken}`,
            ...poll.voters.map(
                (voter) =>
                    `Voter ${voter.voterIndex} (${voter.voterName}): ${voter.voterToken}`,
            ),
            '',
        ]),
    ]
        .join('\n')
        .trimEnd();
