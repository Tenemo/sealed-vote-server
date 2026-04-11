import { describe, expect, it } from 'vitest';

import {
    canRegister,
    derivePollPhase,
    suggestedReconstructionThreshold,
} from '../src/phases';

describe('phase helpers', () => {
    it('defaults missing polls to the open phase', () => {
        expect(derivePollPhase(undefined)).toBe('open');
        expect(derivePollPhase(null)).toBe('open');
    });

    it('returns the stored phase when a poll exists', () => {
        expect(
            derivePollPhase({
                phase: 'preparing',
            }),
        ).toBe('preparing');
        expect(
            derivePollPhase({
                phase: 'complete',
            }),
        ).toBe('complete');
    });

    it('permits joining only while the poll is open', () => {
        expect(
            canRegister({
                isOpen: true,
                phase: 'open',
            }),
        ).toBe(true);
        expect(
            canRegister({
                isOpen: false,
                phase: 'open',
            }),
        ).toBe(false);
        expect(
            canRegister({
                isOpen: true,
                phase: 'preparing',
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
