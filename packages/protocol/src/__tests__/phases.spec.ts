import type { PollResponse } from '@sealed-vote/contracts';
import { describe, expect, test } from 'vitest';

import {
    canClose,
    canRegister,
    canSubmitDecryptionShares,
    canSubmitPublicKeyShare,
    canVote,
    derivePollPhase,
    type PollPhaseState,
    toPollPhaseState,
} from '../phases';

const createPoll = (overrides: Partial<PollResponse> = {}): PollResponse => ({
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'test-poll--1111',
    pollName: 'Test poll',
    createdAt: new Date().toISOString(),
    choices: ['Dog', 'Cat'],
    voters: ['Alice', 'Bob'],
    isOpen: true,
    publicKeyShareCount: 0,
    commonPublicKey: null,
    encryptedVoteCount: 0,
    encryptedTallies: [],
    decryptionShareCount: 0,
    results: [],
    ...overrides,
});

describe('toPollPhaseState', () => {
    test('extracts only the protocol phase fields from the poll response', () => {
        expect(toPollPhaseState(createPoll())).toEqual<PollPhaseState>({
            isOpen: true,
            commonPublicKey: null,
            voterCount: 2,
            encryptedVoteCount: 0,
            encryptedTallyCount: 0,
            resultCount: 0,
        });
    });
});

describe('derivePollPhase', () => {
    test('returns registration for open polls', () => {
        expect(derivePollPhase(createPoll())).toBe('registration');
    });

    test('returns key-generation for closed polls without a common key', () => {
        expect(derivePollPhase(createPoll({ isOpen: false }))).toBe(
            'key-generation',
        );
    });

    test('returns voting when a common key exists and tallies are absent', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                }),
            ),
        ).toBe('voting');
    });

    test('returns tallying while all votes are present but tallies are not yet stored', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                    encryptedVoteCount: 2,
                }),
            ),
        ).toBe('tallying');
    });

    test('returns decryption when tallies exist and results are missing', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                    encryptedTallies: [{ c1: '1', c2: '2' }],
                }),
            ),
        ).toBe('decryption');
    });

    test('returns complete when results exist', () => {
        expect(
            derivePollPhase(
                createPoll({
                    isOpen: false,
                    commonPublicKey: '123',
                    results: [42],
                }),
            ),
        ).toBe('complete');
    });

    test('accepts count-based state for server-side guards', () => {
        expect(
            derivePollPhase({
                isOpen: false,
                commonPublicKey: '123',
                voterCount: 3,
                encryptedVoteCount: 3,
                encryptedTallyCount: 0,
                resultCount: 0,
            }),
        ).toBe('tallying');
    });
});

describe('guards', () => {
    test('reflect the current poll phase', () => {
        const registrationPoll = createPoll();
        expect(canRegister(registrationPoll)).toBe(true);
        expect(canClose(registrationPoll)).toBe(true);
        expect(canSubmitPublicKeyShare(registrationPoll)).toBe(false);

        const votingPoll = createPoll({
            isOpen: false,
            commonPublicKey: '123',
        });
        expect(canVote(votingPoll)).toBe(true);
        expect(canSubmitDecryptionShares(votingPoll)).toBe(false);
    });

    test('does not allow close when fewer than two voters are present', () => {
        expect(
            canClose({
                isOpen: true,
                commonPublicKey: null,
                voterCount: 1,
                encryptedVoteCount: 0,
                encryptedTallyCount: 0,
                resultCount: 0,
            }),
        ).toBe(false);
    });
});
