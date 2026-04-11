import type { PollPhase, PollResponse } from '@sealed-vote/contracts';
import { majorityThreshold } from 'threshold-elgamal/core';

export const derivePollPhase = (
    poll: Pick<PollResponse, 'phase'> | null | undefined,
): PollPhase => poll?.phase ?? 'open';

export const suggestedReconstructionThreshold = (
    participantCount: number,
): number => majorityThreshold(participantCount);

export const canRegister = (
    poll: Pick<PollResponse, 'isOpen' | 'phase'> | null | undefined,
): boolean => !!poll?.isOpen && derivePollPhase(poll) === 'open';
