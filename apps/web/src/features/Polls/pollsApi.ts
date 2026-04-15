import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
    POLL_ROUTES,
    type BoardMessageRecord,
    type BoardMessageRequest,
    type CloseVotingRequest,
    type CreatePollRequest,
    type CreatePollResponse,
    type PollResponse,
    type RegisterVoterRequest,
    type RegisterVoterResponse,
    type RestartCeremonyRequest,
} from '@sealed-vote/contracts';

import { normalizePollApiBaseUrl } from './pollApiBaseUrl';

const apiBaseUrl = normalizePollApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const pollsApi = createApi({
    reducerPath: 'polls',
    baseQuery: fetchBaseQuery({
        baseUrl: apiBaseUrl,
    }),
    tagTypes: ['Poll'],
    endpoints: (build) => ({
        createPoll: build.mutation<CreatePollResponse, CreatePollRequest>({
            query: (pollData) => ({
                url: POLL_ROUTES.create,
                method: 'POST',
                body: pollData,
            }),
            invalidatesTags: ['Poll'],
        }),
        getPoll: build.query<PollResponse, string>({
            query: (pollRef) => ({
                url: POLL_ROUTES.poll(pollRef),
                method: 'GET',
            }),
            providesTags: (result) =>
                result ? [{ type: 'Poll', id: result.id }] : [],
        }),
        registerVoter: build.mutation<
            RegisterVoterResponse,
            { pollId: string; voterData: RegisterVoterRequest }
        >({
            query: ({ pollId, voterData }) => ({
                url: POLL_ROUTES.register(pollId),
                method: 'POST',
                body: voterData,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
        closeVoting: build.mutation<
            void,
            { closeData: CloseVotingRequest; pollId: string }
        >({
            query: ({ closeData, pollId }) => ({
                url: POLL_ROUTES.close(pollId),
                method: 'POST',
                body: closeData,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
        restartCeremony: build.mutation<
            void,
            { pollId: string; restartData: RestartCeremonyRequest }
        >({
            query: ({ pollId, restartData }) => ({
                url: POLL_ROUTES.restartCeremony(pollId),
                method: 'POST',
                body: restartData,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
        postBoardMessage: build.mutation<
            BoardMessageRecord,
            { pollId: string; boardMessage: BoardMessageRequest }
        >({
            query: ({ pollId, boardMessage }) => ({
                url: POLL_ROUTES.boardMessages(pollId),
                method: 'POST',
                body: boardMessage,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
    }),
});

export type { PollResponse };

export const {
    useCreatePollMutation,
    useGetPollQuery,
    useLazyGetPollQuery,
    usePostBoardMessageMutation,
    useCloseVotingMutation,
    useRegisterVoterMutation,
    useRestartCeremonyMutation,
} = pollsApi;
