import { describe, expect, it } from 'vitest';

import {
    canRegister,
    derivePollPhase,
    suggestedReconstructionThreshold,
} from '../src/phases';

describe('phase helpers', () => {
    it('defaults missing polls to the registration phase', () => {
        expect(derivePollPhase(undefined)).toBe('registration');
        expect(derivePollPhase(null)).toBe('registration');
    });

    it('returns the stored phase when a poll exists', () => {
        expect(
            derivePollPhase({
                phase: 'setup',
            }),
        ).toBe('setup');
        expect(
            derivePollPhase({
                phase: 'complete',
            }),
        ).toBe('complete');
    });

    it('permits registration only while the poll is open and in registration', () => {
        expect(
            canRegister({
                isOpen: true,
                phase: 'registration',
            }),
        ).toBe(true);
        expect(
            canRegister({
                isOpen: false,
                phase: 'registration',
            }),
        ).toBe(false);
        expect(
            canRegister({
                isOpen: true,
                phase: 'setup',
            }),
        ).toBe(false);
    });

    it('computes strict-majority reconstruction thresholds', () => {
        expect(suggestedReconstructionThreshold(3)).toBe(2);
        expect(suggestedReconstructionThreshold(5)).toBe(3);
        expect(suggestedReconstructionThreshold(6)).toBe(4);
        expect(suggestedReconstructionThreshold(15)).toBe(8);
    });
});
