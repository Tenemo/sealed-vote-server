import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
    configureLocalE2EEnv,
    getForwardedCliArgs,
    runPnpmSync,
} from './shared.mts';
import {
    readmeDemoFinalVideoPath,
    readmeDemoManifestPath,
    readmeDemoOutputDir,
    type ReadmeDemoManifest,
} from '../support/readmeDemo.mts';

const expectedPanelIds = ['creator', 'participant-one', 'participant-two'];
const browserChromeHeight = 56;
const browserOuterBorder = 1;
const browserWindowGap = 48;
const browserWindowOuterPadding = 48;

const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
};

const ensureFfmpegAvailable = (): void => {
    const result = spawnSync('ffmpeg', ['-version'], {
        stdio: 'ignore',
    });

    if (result.error || result.status !== 0) {
        fail(
            'Missing ffmpeg in PATH. Install ffmpeg locally before running pnpm demo:record.',
        );
    }
};

const cleanDemoOutputDir = (): void => {
    fs.rmSync(readmeDemoOutputDir, {
        force: true,
        recursive: true,
    });
    fs.mkdirSync(readmeDemoOutputDir, {
        recursive: true,
    });
};

const readManifest = (): ReadmeDemoManifest => {
    if (!fs.existsSync(readmeDemoManifestPath)) {
        fail(
            `Missing readme demo manifest at ${readmeDemoManifestPath}. The Playwright recording step did not finish correctly.`,
        );
    }

    let parsedManifest: unknown;

    try {
        parsedManifest = JSON.parse(
            fs.readFileSync(readmeDemoManifestPath, 'utf8'),
        );
    } catch (error) {
        fail(
            error instanceof Error
                ? `Unable to read readme demo manifest: ${error.message}`
                : 'Unable to read readme demo manifest.',
        );
    }

    if (!parsedManifest || typeof parsedManifest !== 'object') {
        fail('Readme demo manifest has an invalid shape.');
    }

    const manifestRecord = parsedManifest as Partial<ReadmeDemoManifest>;
    const panels = manifestRecord.panels;

    if (!Array.isArray(panels)) {
        fail('Readme demo manifest has an invalid shape.');
    }

    const validatedPanels = panels as ReadmeDemoManifest['panels'];

    if (validatedPanels.length !== expectedPanelIds.length) {
        fail(
            `Readme demo manifest must contain ${expectedPanelIds.length} panels.`,
        );
    }

    validatedPanels.forEach((panel, index) => {
        if (!panel || typeof panel !== 'object') {
            fail('Readme demo manifest includes an invalid panel entry.');
        }

        const manifestPanel = panel as ReadmeDemoManifest['panels'][number];

        if (manifestPanel.id !== expectedPanelIds[index]) {
            fail(
                `Readme demo manifest panel ${index + 1} must be ${expectedPanelIds[index]}.`,
            );
        }

        if (
            typeof manifestPanel.addressText !== 'string' ||
            manifestPanel.addressText.length === 0 ||
            typeof manifestPanel.label !== 'string' ||
            manifestPanel.label.length === 0 ||
            typeof manifestPanel.videoPath !== 'string' ||
            manifestPanel.videoPath.length === 0
        ) {
            fail(
                'Readme demo manifest includes a panel without address text, label, or path.',
            );
        }

        if (!path.isAbsolute(manifestPanel.videoPath)) {
            fail(
                `Readme demo panel ${manifestPanel.id} must use an absolute video path.`,
            );
        }

        if (!fs.existsSync(manifestPanel.videoPath)) {
            fail(
                `Missing readme demo panel video at ${manifestPanel.videoPath}.`,
            );
        }
    });

    return manifestRecord as ReadmeDemoManifest;
};

const escapeDrawtext = (value: string): string =>
    value
        .replaceAll('\\', '\\\\')
        .replaceAll(':', '\\:')
        .replaceAll("'", "\\'")
        .replaceAll(',', '\\,')
        .replaceAll('[', '\\[')
        .replaceAll(']', '\\]')
        .replaceAll('%', '\\%');

const createFilterGraph = (manifest: ReadmeDemoManifest): string => {
    const panelWindowFilters = manifest.panels.map((panel, index) => {
        const escapedAddressText = escapeDrawtext(panel.addressText);

        return [
            `[${index}:v]setpts=PTS/${manifest.playbackRate}`,
            `pad=w=iw+${browserOuterBorder * 2}:h=ih+${
                browserChromeHeight + browserOuterBorder * 2
            }:x=${browserOuterBorder}:y=${
                browserChromeHeight + browserOuterBorder
            }:color=white`,
            'drawbox=x=0:y=0:w=iw:h=ih:color=0xd6d9df:t=1',
            `drawbox=x=0:y=0:w=iw:h=${browserChromeHeight}:color=0xf8fafc:t=fill`,
            `drawbox=x=0:y=${browserChromeHeight}:w=iw:h=1:color=0xe5e7eb:t=fill`,
            'drawbox=x=12:y=22:w=10:h=10:color=0xE57373:t=fill',
            'drawbox=x=28:y=22:w=10:h=10:color=0xF0C674:t=fill',
            'drawbox=x=44:y=22:w=10:h=10:color=0x81C784:t=fill',
            'drawbox=x=74:y=14:w=iw-98:h=28:color=0xffffff:t=fill',
            'drawbox=x=74:y=14:w=iw-98:h=28:color=0xd6d9df:t=1',
            `drawtext=text='${escapedAddressText}':x=90:y=22:fontsize=16:fontcolor=0x4b5563`,
            `drawbox=x=${browserOuterBorder}:y=${
                browserChromeHeight + browserOuterBorder
            }:w=iw-${browserOuterBorder * 2}:h=ih-${
                browserChromeHeight + browserOuterBorder * 2
            }:color=0xf3f4f6:t=1[panel${index}]`,
        ].join(',');
    });
    const stackedInputs = manifest.panels
        .map((_, index) => `[panel${index}]`)
        .join('');
    const xstackLayout = manifest.panels
        .map((_, index) => {
            if (index === 0) {
                return '0_0';
            }

            if (index === 1) {
                return `w0+${browserWindowGap}_0`;
            }

            return `w0+w1+${browserWindowGap * 2}_0`;
        })
        .join('|');

    return [
        ...panelWindowFilters,
        `${stackedInputs}xstack=inputs=${manifest.panels.length}:layout=${xstackLayout}:fill=white[stacked]`,
        `[stacked]pad=w=iw+${browserWindowOuterPadding * 2}:h=ih+${
            browserWindowOuterPadding * 2
        }:x=${browserWindowOuterPadding}:y=${browserWindowOuterPadding}:color=white,format=yuv420p[v]`,
    ].join(';');
};

const stitchVideos = (manifest: ReadmeDemoManifest): void => {
    const ffmpegArgs = [
        '-y',
        ...manifest.panels.flatMap((panel) => ['-i', panel.videoPath]),
        '-filter_complex',
        createFilterGraph(manifest),
        '-map',
        '[v]',
        '-an',
        '-c:v',
        'libx264',
        '-crf',
        '23',
        '-preset',
        'medium',
        '-movflags',
        '+faststart',
        readmeDemoFinalVideoPath,
    ];
    const result = spawnSync('ffmpeg', ffmpegArgs, {
        stdio: 'inherit',
    });

    if (result.error || result.status !== 0) {
        fail('ffmpeg failed while stitching the readme demo video.');
    }
};

const main = (): void => {
    process.env.PLAYWRIGHT_WEB_BASE_URL =
        process.env.PLAYWRIGHT_WEB_BASE_URL ?? 'http://localhost:3000';
    process.env.VITE_API_BASE_URL =
        process.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
    configureLocalE2EEnv({
        useBuiltServers: true,
    });
    ensureFfmpegAvailable();
    cleanDemoOutputDir();

    runPnpmSync(['build']);
    runPnpmSync([
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/config/playwright.readme-demo.config.mts',
        ...getForwardedCliArgs(),
    ]);

    stitchVideos(readManifest());
    console.log(`Readme demo video written to ${readmeDemoFinalVideoPath}`);
};

main();
