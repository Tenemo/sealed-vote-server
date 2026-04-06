export const POLL_SLUG_DELIMITER = '--';
export const POLL_SLUG_TITLE_MAX_LENGTH = 32;
export const POLL_SLUG_SUFFIX_LENGTHS = [8, 12, 16, 20, 24, 32] as const;

export const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
