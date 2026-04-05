import type { FastifyInstance } from 'fastify';
import { afterAll, describe, expect, test } from 'vitest';

import { buildServer } from '../buildServer';
import {
    formatSeedManifest,
    seedDatabase,
    type SeedManifestPoll,
} from '../db/seed';
import { fetchPoll } from '../testUtils';

import { resetDatabase } from './resetDatabase';

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const findSeedPoll = (
    manifestPolls: SeedManifestPoll[],
    phase: SeedManifestPoll['phase'],
): SeedManifestPoll => {
    const poll = manifestPolls.find((entry) => entry.phase === phase);
    if (!poll) {
        throw new Error(`Missing ${phase} seed poll.`);
    }

    return poll;
};

describe('seed database', () => {
    let fastify: FastifyInstance | null = null;

    afterAll(async () => {
        await fastify?.close();
    });

    test('resets idempotently and creates manual seed scenarios', async () => {
        await resetDatabase();
        await resetDatabase();

        fastify = await buildServer();

        const manifest = await seedDatabase(fastify);
        const manifestText = formatSeedManifest(manifest);

        expect(manifest.polls).toHaveLength(3);
        expect(manifestText).toContain('Seed registration sample');
        expect(manifestText).toContain('Seed voting sample');
        expect(manifestText).toContain('Seed results sample');

        for (const poll of manifest.polls) {
            expect(poll.pollId).toMatch(uuidPattern);
            expect(poll.creatorToken).toHaveLength(64);
            expect(poll.voters.length).toBeGreaterThanOrEqual(2);

            for (const voter of poll.voters) {
                expect(voter.voterIndex).toBeGreaterThan(0);
                expect(voter.voterName.length).toBeGreaterThan(0);
                expect(voter.voterToken).toHaveLength(64);
            }
        }

        const registrationPoll = findSeedPoll(manifest.polls, 'registration');
        const votingPoll = findSeedPoll(manifest.polls, 'voting');
        const resultsPoll = findSeedPoll(manifest.polls, 'results');

        const registrationState = await fetchPoll(
            fastify,
            registrationPoll.pollId,
        );
        expect(registrationState.pollName).toBe('Seed registration sample');
        expect(registrationState.isOpen).toBe(true);
        expect(registrationState.voters).toEqual(['Alice', 'Bob']);
        expect(registrationState.publicKeyShares).toEqual([]);
        expect(registrationState.commonPublicKey).toBeNull();
        expect(registrationState.encryptedVotes).toEqual([]);
        expect(registrationState.encryptedTallies).toEqual([]);
        expect(registrationState.decryptionShares).toEqual([]);
        expect(registrationState.results).toEqual([]);

        const votingState = await fetchPoll(fastify, votingPoll.pollId);
        expect(votingState.pollName).toBe('Seed voting sample');
        expect(votingState.isOpen).toBe(false);
        expect(votingState.voters).toEqual(['Alice', 'Bob', 'Charlie']);
        expect(votingState.publicKeyShares).toHaveLength(3);
        expect(votingState.commonPublicKey).not.toBeNull();
        expect(votingState.encryptedVotes).toEqual([]);
        expect(votingState.encryptedTallies).toEqual([]);
        expect(votingState.decryptionShares).toEqual([]);
        expect(votingState.results).toEqual([]);

        const resultsState = await fetchPoll(fastify, resultsPoll.pollId);
        expect(resultsState.pollName).toBe('Seed results sample');
        expect(resultsState.isOpen).toBe(false);
        expect(resultsState.voters).toEqual(['Ada', 'Grace', 'Linus']);
        expect(resultsState.publicKeyShares).toHaveLength(3);
        expect(resultsState.commonPublicKey).not.toBeNull();
        expect(resultsState.encryptedVotes).toHaveLength(3);
        expect(resultsState.encryptedTallies).toHaveLength(3);
        expect(resultsState.decryptionShares).toHaveLength(3);
        expect(resultsState.results).toHaveLength(3);
        expect(resultsState.results.every((value) => value > 0)).toBe(true);
    });
});
