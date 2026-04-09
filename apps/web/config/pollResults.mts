type PublishedPollResultsInput = {
    choices: readonly string[];
    resultScores: readonly number[];
};

export type OrderedPublishedPollResult = {
    choiceIndex: number;
    choiceName: string;
    score: number;
};

export const hasPublishedResultScores = (value: unknown): boolean =>
    Array.isArray(value) && value.length > 0;

export const orderPublishedPollResults = ({
    choices,
    resultScores,
}: PublishedPollResultsInput): OrderedPublishedPollResult[] =>
    choices
        .map((choiceName, choiceIndex) => ({
            choiceIndex,
            choiceName,
            score: resultScores[choiceIndex] ?? Number.NEGATIVE_INFINITY,
        }))
        .filter(
            (entry) =>
                entry.choiceName.length > 0 && Number.isFinite(entry.score),
        )
        .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }

            return left.choiceIndex - right.choiceIndex;
        });
