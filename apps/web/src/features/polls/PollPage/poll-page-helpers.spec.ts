import { describe, expect, test } from 'vitest';

import { hasCompleteDraftScores } from './poll-page-helpers';

describe('hasCompleteDraftScores', () => {
    test.each([
        {
            choiceCount: 0,
            draftScores: [],
            expectedResult: false,
            label: 'rejects an empty poll draft',
        },
        {
            choiceCount: 2,
            draftScores: [],
            expectedResult: false,
            label: 'rejects a draft before score slots are initialized',
        },
        {
            choiceCount: 2,
            draftScores: [4],
            expectedResult: false,
            label: 'rejects a shorter complete-looking draft',
        },
        {
            choiceCount: 2,
            draftScores: [4, null],
            expectedResult: false,
            label: 'rejects a draft with an unscored choice',
        },
        {
            choiceCount: 2,
            draftScores: [4, 7, 9],
            expectedResult: false,
            label: 'rejects a draft with extra scores',
        },
        {
            choiceCount: 2,
            draftScores: [4, 7],
            expectedResult: true,
            label: 'accepts one score for every choice',
        },
    ])('$label', ({ choiceCount, draftScores, expectedResult }) => {
        expect(
            hasCompleteDraftScores({
                choiceCount,
                draftScores,
            }),
        ).toBe(expectedResult);
    });
});
