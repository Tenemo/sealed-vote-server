const listedSpecPattern =
    /^\s*\[[^\]]+\]\s+›\s+(.+?):\d+:\d+\s+›\s+/u;

export const collectListedSpecFiles = (listOutput: string): string[] => {
    const listedFiles = new Set<string>();

    for (const line of listOutput.split(/\r?\n/u)) {
        const match = line.match(listedSpecPattern);

        if (!match) {
            continue;
        }

        listedFiles.add(match[1]);
    }

    return [...listedFiles];
};
