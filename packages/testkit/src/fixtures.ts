export const DEFAULT_TEST_CHOICES = ['Option 1', 'Option 2', 'Option 3'];

export const DEFAULT_TEST_VOTERS = ['Alice', 'Bob', 'Charlie'];

export type ScoreMatrix = Record<string, Record<string, number>>;

export const createScoreMatrix = (
    choices: string[],
    voterNames: string[],
): ScoreMatrix =>
    Object.fromEntries(
        voterNames.map((voterName, voterIndex) => [
            voterName,
            Object.fromEntries(
                choices.map((choice, choiceIndex) => [
                    choice,
                    voterIndex + choiceIndex + 2,
                ]),
            ),
        ]),
    );
