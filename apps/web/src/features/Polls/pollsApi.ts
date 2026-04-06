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

import { apiBaseUrl } from 'app/apiConfig';

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
