import { describe, expect, it } from 'vitest';

import {
    activeCeremonyPollingIntervalMs,
    getPollRefreshInterval,
    steadyStatePollingIntervalMs,
} from './pollRefreshInterval';

describe('getPollRefreshInterval', () => {
    it('uses the steady interval before poll data is loaded', () => {
        expect(getPollRefreshInterval(null)).toBe(steadyStatePollingIntervalMs);
        expect(getPollRefreshInterval(undefined)).toBe(
            steadyStatePollingIntervalMs,
        );
    });

    it.each(['securing', 'ready-to-reveal', 'revealing'] as const)(
        'uses the active ceremony interval during the %s phase',
        (phase) => {
            expect(getPollRefreshInterval({ phase })).toBe(
                activeCeremonyPollingIntervalMs,
            );
        },
    );

    it.each(['open', 'complete', 'aborted'] as const)(
        'uses the steady interval during the %s phase',
        (phase) => {
            expect(getPollRefreshInterval({ phase })).toBe(
                steadyStatePollingIntervalMs,
            );
        },
    );
});
