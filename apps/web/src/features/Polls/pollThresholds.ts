const minimumSupportedParticipantCount = 3;

const resolvedParticipantCount = (participantCount: number): number =>
    Math.max(participantCount, minimumSupportedParticipantCount);

export const resolveStrictMajorityFloor = (participantCount: number): number =>
    Math.floor(resolvedParticipantCount(participantCount) / 2) + 1;

export const resolveThresholdPercentRange = (
    participantCount: number,
): {
    defaultPercent: number;
    maxPercent: number;
    minPercent: number;
} => {
    const safeParticipantCount = resolvedParticipantCount(participantCount);

    return {
        defaultPercent: 51,
        maxPercent: Math.floor(
            ((safeParticipantCount - 1) / safeParticipantCount) * 100,
        ),
        minPercent: 51,
    };
};

export const clampThresholdPercent = (
    participantCount: number,
    thresholdPercent: number,
): number => {
    const range = resolveThresholdPercentRange(participantCount);

    return Math.min(
        range.maxPercent,
        Math.max(range.minPercent, thresholdPercent),
    );
};

export const resolveThresholdPreview = (
    participantCount: number,
    thresholdPercent: number,
): number => {
    const safeParticipantCount = resolvedParticipantCount(participantCount);
    const strictMajorityFloor =
        resolveStrictMajorityFloor(safeParticipantCount);
    const boundedPercent = clampThresholdPercent(
        safeParticipantCount,
        thresholdPercent,
    );
    const resolvedThreshold = Math.ceil(
        (boundedPercent / 100) * safeParticipantCount,
    );

    return Math.min(
        safeParticipantCount - 1,
        Math.max(strictMajorityFloor, resolvedThreshold),
    );
};

export { minimumSupportedParticipantCount };
