import { describe, expect, it } from 'vitest';

import { canRegister, derivePollPhase } from '../src/phases';

describe('phase helpers', () => {
    it('defaults missing polls to the open phase', () => {
        expect(derivePollPhase(undefined)).toBe('open');
        expect(derivePollPhase(null)).toBe('open');
    });

    it('returns the stored phase when a poll exists', () => {
        expect(
            derivePollPhase({
                phase: 'securing',
            }),
        ).toBe('securing');
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
                phase: 'securing',
            }),
        ).toBe(false);
    });
});
