import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    removeCreatorSession,
    saveCreatorSession,
} from './creatorSessionStorage';

describe('creatorSessionStorage', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('stores and restores creator sessions by poll id and slug', () => {
        saveCreatorSession({
            creatorToken: 'creator-token',
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
        });

        expect(findCreatorSessionByPollId('poll-1')).toEqual({
            creatorToken: 'creator-token',
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
        });
        expect(findCreatorSessionByPollSlug('best-fruit--1111')).toEqual({
            creatorToken: 'creator-token',
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
        });
    });

    it('removes creator sessions once the poll is finished', () => {
        saveCreatorSession({
            creatorToken: 'creator-token',
            pollId: 'poll-1',
            pollSlug: 'best-fruit--1111',
        });

        removeCreatorSession('poll-1');

        expect(findCreatorSessionByPollId('poll-1')).toBeNull();
        expect(findCreatorSessionByPollSlug('best-fruit--1111')).toBeNull();
    });
});
