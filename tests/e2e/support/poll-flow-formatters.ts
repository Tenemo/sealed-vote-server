export type ExpectedVerifiedResult = {
    acceptedBallotCount: number;
    choice: string;
    displayedMean: string;
    tally: string;
};

const normalizePollFlowText = (value: string): string =>
    value.replaceAll(/\s+/gu, ' ').trim();

export const parseCeremonyMetricValue = ({
    label,
    rowText,
}: {
    label: string;
    rowText: string;
}): string | null => {
    const normalizedLabel = normalizePollFlowText(label);
    const normalizedRowText = normalizePollFlowText(rowText);

    if (normalizedRowText.startsWith(normalizedLabel)) {
        const metricValue = normalizedRowText
            .slice(normalizedLabel.length)
            .trim();
        return metricValue === '' ? null : metricValue;
    }

    if (normalizedRowText.endsWith(normalizedLabel)) {
        const metricValue = normalizedRowText
            .slice(0, -normalizedLabel.length)
            .trim();
        return metricValue === '' ? null : metricValue;
    }

    return null;
};

export const parseSubmittedVoterCount = (value: string): number | null => {
    const match = normalizePollFlowText(value).match(
        /^Submitted voters\s+(\d+)/u,
    );

    if (!match) {
        return null;
    }

    return Number.parseInt(match[1], 10);
};

export const createExpectedVerifiedResults = ({
    choices,
    scorecards,
}: {
    choices: readonly string[];
    scorecards: readonly (readonly number[])[];
}): ExpectedVerifiedResult[] => {
    if (scorecards.length === 0) {
        throw new Error('Expected at least one scorecard.');
    }

    return choices
        .map((choice, choiceIndex) => {
            const tally = scorecards.reduce((sum, scorecard) => {
                const score = scorecard[choiceIndex];

                if (!Number.isInteger(score)) {
                    throw new Error(
                        `Missing or invalid score for choice index ${choiceIndex}.`,
                    );
                }

                return sum + score;
            }, 0);

            return {
                acceptedBallotCount: scorecards.length,
                choice,
                choiceIndex,
                displayedMean: (tally / scorecards.length).toFixed(2),
                tally: String(tally),
            };
        })
        .sort((left, right) => {
            const meanDifference =
                Number(right.displayedMean) - Number(left.displayedMean);

            if (meanDifference !== 0) {
                return meanDifference;
            }

            return left.choiceIndex - right.choiceIndex;
        })
        .map(({ choiceIndex: _choiceIndex, ...result }) => result);
};
