const mockedCanRegister = jest.fn();
const mockedGetPollInitiate = jest.fn();
const mockedRegisterVoterInitiate = jest.fn();
const mockedProcessPublicPrivateKeys = jest.fn();
const mockedEncryptVotesGenerateShares = jest.fn();
const mockedDecryptResults = jest.fn();

jest.mock('@sealed-vote/protocol', () => ({
    canRegister: (...args: unknown[]) => mockedCanRegister(...args),
}));

jest.mock('features/Polls/pollsApi', () => ({
    pollsApi: {
        endpoints: {
            getPollSkipCache: {
                initiate: (...args: unknown[]) =>
                    mockedGetPollInitiate(...args),
            },
            registerVoter: {
                initiate: (...args: unknown[]) =>
                    mockedRegisterVoterInitiate(...args),
            },
        },
    },
}));

jest.mock('./processPublicPrivateKeys', () => ({
    processPublicPrivateKeys: (...args: unknown[]) =>
        mockedProcessPublicPrivateKeys(...args),
}));

jest.mock('./encryptVotesGenerateShares', () => ({
    encryptVotesGenerateShares: (...args: unknown[]) =>
        mockedEncryptVotesGenerateShares(...args),
}));

jest.mock('./decryptResults', () => ({
    decryptResults: (...args: unknown[]) => mockedDecryptResults(...args),
}));

import { vote } from './vote';

import {
    setIsVotingInProgress,
    setProgressMessage,
    setSelectedScores,
    setVoterSession,
} from 'features/Polls/votingSlice';

describe('vote thunk', () => {
    beforeEach(() => {
        mockedCanRegister.mockReset();
        mockedGetPollInitiate.mockReset();
        mockedRegisterVoterInitiate.mockReset();
        mockedProcessPublicPrivateKeys.mockReset();
        mockedEncryptVotesGenerateShares.mockReset();
        mockedDecryptResults.mockReset();
    });

    it('dispatches voting progress and stores voter registration data', async () => {
        const selectedScores = { Apples: 7 };
        mockedCanRegister.mockReturnValue(true);
        mockedGetPollInitiate.mockReturnValue({ type: 'getPoll' });
        mockedRegisterVoterInitiate.mockReturnValue({ type: 'registerVoter' });
        mockedProcessPublicPrivateKeys.mockReturnValue({
            type: 'processPublicPrivateKeys',
        });
        mockedEncryptVotesGenerateShares.mockReturnValue({
            type: 'encryptVotesGenerateShares',
        });
        mockedDecryptResults.mockReturnValue({ type: 'decryptResults' });

        const dispatch = jest.fn((action) => {
            switch (action.type) {
                case 'getPoll':
                    return {
                        unwrap: async () => ({
                            pollName: 'Best fruit',
                            createdAt: '2026-01-01T00:00:00.000Z',
                            choices: ['Apples'],
                            voters: [],
                            isOpen: true,
                            publicKeyShares: [],
                            commonPublicKey: null,
                            encryptedVotes: [],
                            encryptedTallies: [],
                            decryptionShares: [],
                            results: [],
                        }),
                    };
                case 'registerVoter':
                    return {
                        unwrap: async () => ({
                            message: 'Registered successfully',
                            pollId: 'poll-1',
                            voterName: 'Alice',
                            voterIndex: 1,
                            voterToken: 'voter-token',
                        }),
                    };
                case 'processPublicPrivateKeys':
                case 'encryptVotesGenerateShares':
                case 'decryptResults':
                    return {
                        unwrap: async () => undefined,
                    };
                default:
                    return action;
            }
        });

        await vote({
            pollId: 'poll-1',
            voterName: 'Alice',
            selectedScores,
        })(dispatch as never, (() => ({ voting: {} })) as never, undefined);

        expect(dispatch).toHaveBeenCalledWith(
            setIsVotingInProgress({
                pollId: 'poll-1',
                isVotingInProgress: true,
            }),
        );
        expect(dispatch).toHaveBeenCalledWith(
            setSelectedScores({
                pollId: 'poll-1',
                selectedScores,
            }),
        );
        expect(mockedRegisterVoterInitiate).toHaveBeenCalledWith({
            pollId: 'poll-1',
            voterData: { voterName: 'Alice' },
        });
        expect(dispatch).toHaveBeenCalledWith(
            setVoterSession({
                pollId: 'poll-1',
                voterName: 'Alice',
                voterIndex: 1,
                voterToken: 'voter-token',
            }),
        );
        expect(dispatch).toHaveBeenCalledWith(
            setIsVotingInProgress({
                pollId: 'poll-1',
                isVotingInProgress: false,
            }),
        );
        expect(dispatch).toHaveBeenCalledWith(
            setProgressMessage({
                pollId: 'poll-1',
                progressMessage: null,
            }),
        );
    });
});
