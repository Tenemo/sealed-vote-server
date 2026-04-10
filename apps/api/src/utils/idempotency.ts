export const areStringArraysEqual = (
    left: readonly string[],
    right: readonly string[],
): boolean =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
