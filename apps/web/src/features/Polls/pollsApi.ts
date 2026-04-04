import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
    POLL_ROUTES,
    type ClosePollRequest,
    type CreatePollRequest,
    type CreatePollResponse,
    type DecryptionSharesRequest,
    type PollResponse,
    type PublicKeyShareRequest,
    type RegisterVoterRequest,
    type RegisterVoterResponse,
    type VoteRequest,
    type VoteResponse,
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
        getPollSkipCache: build.mutation<PollResponse, { pollId: string }>({
            query: ({ pollId }) => ({
                url: POLL_ROUTES.poll(pollId),
                method: 'GET',
            }),
        }),
        getPoll: build.query<PollResponse, string>({
            query: (pollId) => ({
                url: POLL_ROUTES.poll(pollId),
                method: 'GET',
            }),
            providesTags: (_result, _error, pollId) => [
                { type: 'Poll', id: pollId },
            ],
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
        closePoll: build.mutation<
            void,
            { pollId: string; closeData: ClosePollRequest }
        >({
            query: ({ pollId, closeData }) => ({
                url: POLL_ROUTES.close(pollId),
                method: 'POST',
                body: closeData,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
        submitPublicKeyShare: build.mutation<
            void,
            { pollId: string; publicKeyShareData: PublicKeyShareRequest }
        >({
            query: ({ pollId, publicKeyShareData }) => ({
                url: POLL_ROUTES.publicKeyShare(pollId),
                method: 'POST',
                body: publicKeyShareData,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
        vote: build.mutation<
            VoteResponse,
            { pollId: string; voteData: VoteRequest }
        >({
            query: ({ pollId, voteData }) => ({
                url: POLL_ROUTES.vote(pollId),
                method: 'POST',
                body: voteData,
                responseHandler: 'text',
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
        submitDecryptionShares: build.mutation<
            void,
            { pollId: string; decryptionSharesData: DecryptionSharesRequest }
        >({
            query: ({ pollId, decryptionSharesData }) => ({
                url: POLL_ROUTES.decryptionShares(pollId),
                method: 'POST',
                body: decryptionSharesData,
            }),
            invalidatesTags: (_result, _error, { pollId }) => [
                { type: 'Poll', id: pollId },
            ],
        }),
    }),
});

export type { PollResponse, RegisterVoterResponse };

export const {
    useCreatePollMutation,
    useGetPollQuery,
    useRegisterVoterMutation,
    useClosePollMutation,
    useSubmitPublicKeyShareMutation,
    useVoteMutation,
    useSubmitDecryptionSharesMutation,
} = pollsApi;
