import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
    POLL_ROUTES,
    type BoardMessageRecord,
    type BoardMessageRequest,
    type BoardMessagesResponse,
    type CreatePollRequest,
    type CreatePollResponse,
    type CloseVotingRequest,
    type PollResponse,
    type RecoverSessionRequest,
    type RecoverSessionResponse,
    type RegisterVoterRequest,
    type RegisterVoterResponse,
    type RestartCeremonyRequest,
} from '@sealed-vote/contracts';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = configuredApiBaseUrl
    ? configuredApiBaseUrl.replace(/\/+$/, '')
    : '/';

export const pollsApi = createApi({
    reducerPath: 'polls',
    baseQuery: fetchBaseQuery({
        baseUrl: apiBaseUrl,
    }),
    tagTypes: ['Poll', 'Board'],
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
                result
                    ? [
                          { type: 'Poll', id: result.id },
                          { type: 'Board', id: result.id },
                      ]
                    : [],
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
        recoverSession: build.mutation<
            RecoverSessionResponse,
            { pollId: string; recoveryData: RecoverSessionRequest }
        >({
            query: ({ pollId, recoveryData }) => ({
                url: POLL_ROUTES.recoverSession(pollId),
                method: 'POST',
                body: recoveryData,
            }),
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
        getBoardMessages: build.query<
            BoardMessagesResponse,
            { pollId: string; afterEntryHash?: string }
        >({
            query: ({ afterEntryHash, pollId }) => ({
                url: POLL_ROUTES.boardMessages(pollId),
                method: 'GET',
                params: afterEntryHash ? { afterEntryHash } : undefined,
            }),
            providesTags: (_result, _error, { pollId }) => [
                { type: 'Board', id: pollId },
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
                { type: 'Board', id: pollId },
            ],
        }),
    }),
});

export type { PollResponse };

export const {
    useCreatePollMutation,
    useGetBoardMessagesQuery,
    useGetPollQuery,
    usePostBoardMessageMutation,
    useRecoverSessionMutation,
    useCloseVotingMutation,
    useRegisterVoterMutation,
    useRestartCeremonyMutation,
} = pollsApi;
