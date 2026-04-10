import {
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
    removeVoterSession,
    saveVoterSession,
} from './voterSessionStorage';

describe('voterSessionStorage', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('stores and restores voter sessions by poll id and slug', () => {
        saveVoterSession({
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            voterIndex: 2,
            voterName: 'Alice',
            voterToken: 'voter-token',
        });

        expect(findVoterSessionByPollId('poll-1')).toEqual({
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            voterIndex: 2,
            voterName: 'Alice',
            voterToken: 'voter-token',
        });
        expect(findVoterSessionByPollSlug('best-fruit--1111')).toEqual({
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            voterIndex: 2,
            voterName: 'Alice',
            voterToken: 'voter-token',
        });
    });

    it('removes voter sessions once the poll is finished', () => {
        saveVoterSession({
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            voterIndex: 2,
            voterName: 'Alice',
            voterToken: 'voter-token',
        });

        removeVoterSession('poll-1');

        expect(findVoterSessionByPollId('poll-1')).toBeNull();
        expect(findVoterSessionByPollSlug('best-fruit--1111')).toBeNull();
    });

    it('filters out malformed stored sessions while preserving valid ones', () => {
        window.localStorage.setItem(
            'sealed-vote.voter-sessions.v1',
            JSON.stringify({
                'poll-1': {
                    pollId: 'poll-1',
                    pollSlug: 'best-fruit--1111',
                    voterIndex: 2,
                    voterName: 'Alice',
                    voterToken: 'voter-token',
                },
                'poll-2': {
                    pollId: 'poll-2',
                    pollSlug: 'broken--2222',
                    voterIndex: 'not-a-number',
                    voterName: 'Bob',
                    voterToken: 'bad-token',
                },
                'poll-3': {
                    pollId: 'different-poll',
                    pollSlug: 'mismatch--3333',
                    voterIndex: 3,
                    voterName: 'Carol',
                    voterToken: 'another-token',
                },
            }),
        );

        expect(findVoterSessionByPollId('poll-1')).toEqual({
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
            voterIndex: 2,
            voterName: 'Alice',
            voterToken: 'voter-token',
        });
        expect(findVoterSessionByPollId('poll-2')).toBeNull();
        expect(findVoterSessionByPollId('poll-3')).toBeNull();
        expect(findVoterSessionByPollSlug('broken--2222')).toBeNull();
        expect(findVoterSessionByPollSlug('mismatch--3333')).toBeNull();
    });

    it('ignores storage write failures instead of throwing', () => {
        const setItemSpy = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('quota exceeded');
            });

        expect(() => {
            saveVoterSession({
                pollId: 'poll-1',
                pollSlug: 'best-fruit--1111',
                voterIndex: 2,
                voterName: 'Alice',
                voterToken: 'voter-token',
            });
        }).not.toThrow();

        setItemSpy.mockRestore();
    });
});
