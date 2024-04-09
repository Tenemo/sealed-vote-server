export const getUniquePollName = (baseName: string): string =>
    `${baseName}-${Date.now()}`;
