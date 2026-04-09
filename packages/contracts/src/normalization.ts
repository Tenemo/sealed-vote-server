export const normalizeTrimmedString = (value: string): string => value.trim();

export const normalizeTrimmedStrings = (values: readonly string[]): string[] =>
    values.map(normalizeTrimmedString);

export const hasBlankStrings = (values: readonly string[]): boolean =>
    values.some((value) => value.length === 0);

export const hasDuplicateStrings = (values: readonly string[]): boolean =>
    new Set(values).size !== values.length;
