import { TestPollBuilder, type TestPollContext } from '@sealed-vote/testkit';
import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { polls } from './schema.js';

type SeedPhase = 'registration' | 'setup';

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
const setupSampleName = 'Seed setup sample';
const experimentalSampleName = 'Seed experimental sample';
const seedPollNames = [
    registrationSampleName,
    setupSampleName,
    experimentalSampleName,
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

const buildSetupSample = async (
    fastify: FastifyInstance,
): Promise<TestPollContext> => {
    const builder = new TestPollBuilder(fastify)
        .withPollName(setupSampleName)
        .withChoices(['Dog', 'Cat', 'Goat'])
        .withVoters(['Alice', 'Bob', 'Charlie']);

    await builder.create();
    await builder.registerVoters();
    await builder.close();

    return builder.getContext();
};

const buildExperimentalSample = async (
    fastify: FastifyInstance,
): Promise<TestPollContext> => {
    const builder = new TestPollBuilder(fastify)
        .withPollName(experimentalSampleName)
        .withChoices(['Red', 'Green', 'Blue', 'Yellow'])
        .withVoters(['Ada', 'Grace', 'Linus', 'Ken']);

    await builder.create();
    await builder.registerVoters();
    await builder.close();

    return builder.getContext();
};

export const seedDatabase = async (
    fastify: FastifyInstance,
): Promise<SeedManifest> => {
    await fastify.db
        .delete(polls)
        .where(inArray(polls.pollName, seedPollNames));

    const registrationSample = await buildRegistrationSample(fastify);
    const setupSample = await buildSetupSample(fastify);
    const experimentalSample = await buildExperimentalSample(fastify);

    return {
        generatedAt: new Date().toISOString(),
        polls: [
            toManifestPoll(
                registrationSampleName,
                'registration',
                registrationSample,
            ),
            toManifestPoll(setupSampleName, 'setup', setupSample),
            toManifestPoll(experimentalSampleName, 'setup', experimentalSample),
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
