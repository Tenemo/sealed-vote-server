import type { PollResponse } from '@sealed-vote/contracts';

export type PollData = PollResponse;
export type PollBoardEntry = PollData['boardEntries'][number];
