import type { PollResponse } from '@sealed-vote/contracts';

const steadyStatePollingIntervalMs = 5_000;
const activeCeremonyPollingIntervalMs = 1_000;

const activeCeremonyPhases = new Set<PollResponse['phase']>([
    'ready-to-reveal',
    'revealing',
    'securing',
]);

export const getPollRefreshInterval = (
    poll: Pick<PollResponse, 'phase'> | null | undefined,
): number =>
    poll && activeCeremonyPhases.has(poll.phase)
        ? activeCeremonyPollingIntervalMs
        : steadyStatePollingIntervalMs;

export { activeCeremonyPollingIntervalMs, steadyStatePollingIntervalMs };
