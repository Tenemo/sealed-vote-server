import {
    clampThresholdPercent,
    minimumSupportedParticipantCount,
    resolveStrictMajorityFloor,
    resolveThresholdPercentRange,
    resolveThresholdPreview,
} from './pollThresholds';

describe('pollThresholds', () => {
    it('keeps the slider bounded to the strict-majority-safe range', () => {
        expect(resolveThresholdPercentRange(3)).toEqual({
            defaultPercent: 51,
            maxPercent: 66,
            minPercent: 51,
        });
        expect(resolveThresholdPercentRange(5)).toEqual({
            defaultPercent: 51,
            maxPercent: 80,
            minPercent: 51,
        });
    });

    it('resolves preview counts using strict-majority clamping', () => {
        expect(resolveThresholdPreview(3, 51)).toBe(2);
        expect(resolveThresholdPreview(5, 60)).toBe(3);
        expect(resolveThresholdPreview(5, 80)).toBe(4);
        expect(resolveThresholdPreview(5, 99)).toBe(4);
    });

    it('derives a usable default range even before three participants have joined', () => {
        expect(minimumSupportedParticipantCount).toBe(3);
        expect(resolveStrictMajorityFloor(1)).toBe(2);
        expect(clampThresholdPercent(1, 10)).toBe(51);
        expect(resolveThresholdPreview(1, 51)).toBe(2);
    });
});
