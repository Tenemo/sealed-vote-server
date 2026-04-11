import {
    clampThresholdPercent,
    minimumSupportedParticipantCount,
    resolveStrictMajorityFloor,
    resolveThresholdPercentRange,
    resolveThresholdPreview,
} from './pollThresholds';

describe('pollThresholds', () => {
    it('keeps the slider bounded between the majority floor and 100 percent', () => {
        expect(resolveThresholdPercentRange(3)).toEqual({
            defaultPercent: 66,
            maxPercent: 100,
            minPercent: 66,
        });
        expect(resolveThresholdPercentRange(5)).toEqual({
            defaultPercent: 60,
            maxPercent: 100,
            minPercent: 60,
        });
    });

    it('resolves preview counts using majority-floor to n-of-n clamping', () => {
        expect(resolveThresholdPreview(3, 66)).toBe(2);
        expect(resolveThresholdPreview(5, 60)).toBe(3);
        expect(resolveThresholdPreview(5, 80)).toBe(4);
        expect(resolveThresholdPreview(5, 100)).toBe(5);
    });

    it('derives a usable default range even before three participants have joined', () => {
        expect(minimumSupportedParticipantCount).toBe(3);
        expect(resolveStrictMajorityFloor(1)).toBe(2);
        expect(clampThresholdPercent(1, 10)).toBe(66);
        expect(resolveThresholdPreview(1, 66)).toBe(2);
    });
});
