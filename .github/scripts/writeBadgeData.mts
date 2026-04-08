import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CoverageMetric = {
    covered: number;
    total: number;
};

type CoverageSummary = {
    total?: {
        lines?: CoverageMetric;
    };
};

type BadgePayload = {
    color: string;
    label: string;
    message: string;
    schemaVersion: 1;
};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, '..', '..');
const badgeDataDirectory = path.resolve(repoRoot, '.github', 'badge-data');

const coverageSummaryPaths = [
    path.resolve(repoRoot, 'apps', 'api', 'coverage', 'coverage-summary.json'),
    path.resolve(repoRoot, 'apps', 'web', 'coverage', 'coverage-summary.json'),
    path.resolve(
        repoRoot,
        'packages',
        'protocol',
        'coverage',
        'coverage-summary.json',
    ),
];

const readJsonFile = async <T>(filePath: string): Promise<T> =>
    JSON.parse(await fs.readFile(filePath, 'utf8')) as T;

const createBadgePayload = (
    label: string,
    message: string,
    color: string,
): BadgePayload => ({
    color,
    label,
    message,
    schemaVersion: 1,
});

const resolveCoverageColor = (coveragePercent: number): string => {
    if (coveragePercent >= 90) {
        return 'brightgreen';
    }

    if (coveragePercent >= 80) {
        return 'green';
    }

    if (coveragePercent >= 70) {
        return 'yellowgreen';
    }

    if (coveragePercent >= 60) {
        return 'yellow';
    }

    if (coveragePercent >= 50) {
        return 'orange';
    }

    return 'red';
};

const formatCoveragePercent = (coveragePercent: number): string => {
    const roundedPercent = Math.round(coveragePercent * 10) / 10;

    return `${roundedPercent.toFixed(1).replace(/\.0$/, '')}%`;
};

const readCoveragePercent = async (): Promise<number> => {
    let coveredLines = 0;
    let totalLines = 0;

    for (const coverageSummaryPath of coverageSummaryPaths) {
        const coverageSummary =
            await readJsonFile<CoverageSummary>(coverageSummaryPath);
        const lines = coverageSummary.total?.lines;

        if (!lines) {
            throw new Error(
                `Coverage summary at ${coverageSummaryPath} is missing total line metrics.`,
            );
        }

        coveredLines += lines.covered;
        totalLines += lines.total;
    }

    if (totalLines === 0) {
        throw new Error('Combined coverage total is zero.');
    }

    return (coveredLines / totalLines) * 100;
};

const readNodeVersion = async (): Promise<string> => {
    const nvmrcPath = path.resolve(repoRoot, '.nvmrc');
    const nodeVersion = (await fs.readFile(nvmrcPath, 'utf8')).trim();

    if (!nodeVersion) {
        throw new Error('.nvmrc is empty.');
    }

    return nodeVersion.replace(/^v/i, '');
};

const writeBadgeFile = async (
    fileName: string,
    payload: BadgePayload,
): Promise<void> => {
    await fs.writeFile(
        path.resolve(badgeDataDirectory, fileName),
        `${JSON.stringify(payload, null, 4)}\n`,
        'utf8',
    );
};

const main = async (): Promise<void> => {
    await fs.mkdir(badgeDataDirectory, {
        recursive: true,
    });

    const coveragePercent = await readCoveragePercent();
    const nodeVersion = await readNodeVersion();

    await Promise.all([
        writeBadgeFile(
            'coverage.json',
            createBadgePayload(
                'coverage',
                formatCoveragePercent(coveragePercent),
                resolveCoverageColor(coveragePercent),
            ),
        ),
        writeBadgeFile(
            'node.json',
            createBadgePayload('node', nodeVersion, '5FA04E'),
        ),
    ]);
};

void main();
