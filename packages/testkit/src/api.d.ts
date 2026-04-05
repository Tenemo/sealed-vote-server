import { DecryptionSharesRequest, PublicKeyShareRequest, RegisterVoterResponse, VoteRequest } from '@sealed-vote/contracts';
import type { FastifyInstance } from 'fastify';
export declare const getUniquePollName: (baseName?: string) => string;
export declare const createPoll: (fastify: FastifyInstance, pollName?: string, choices?: string[]) => Promise<{
    pollId: string;
    creatorToken: string;
    pollName: string;
    choices: string[];
}>;
export declare const deletePoll: (fastify: FastifyInstance, pollId: string, creatorToken: string) => Promise<{
    success: boolean;
    message?: string;
}>;
export declare const registerVoter: (fastify: FastifyInstance, pollId: string, voterName: string) => Promise<({
    success: true;
} & RegisterVoterResponse) | {
    success: false;
    message?: string;
}>;
export declare const closePoll: (fastify: FastifyInstance, pollId: string, creatorToken: string) => Promise<{
    success: boolean;
    message?: string;
}>;
export declare const publicKeyShare: (fastify: FastifyInstance, pollId: string, payload: PublicKeyShareRequest) => Promise<{
    success: boolean;
    message?: string;
}>;
export declare const vote: (fastify: FastifyInstance, pollId: string, payload: VoteRequest) => Promise<{
    success: boolean;
    message?: string;
}>;
export declare const decryptionShares: (fastify: FastifyInstance, pollId: string, payload: DecryptionSharesRequest) => Promise<{
    success: boolean;
    message?: string;
}>;
