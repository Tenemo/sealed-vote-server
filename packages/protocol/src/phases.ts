import type { PollPhase, PollResponse } from '@sealed-vote/contracts';

export const derivePollPhase = (
    poll: Pick<PollResponse, 'phase'> | null | undefined,
): PollPhase => poll?.phase ?? 'open';

export const canRegister = (
    poll: Pick<PollResponse, 'isOpen' | 'phase'> | null | undefined,
): boolean => !!poll?.isOpen && derivePollPhase(poll) === 'open';
