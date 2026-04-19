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
} from '../support/readme-demo.mts';

const expectedPanelIds = ['creator', 'participant-one', 'participant-two'];
const panelLabelHeight = 52;
const panelGap = 48;
const canvasColor = '0x303030';
const labelTextColor = '0xffffff';
const labelDividerColor = '0x5a5a5a';
const panelMarkerTextColor = '0x7a7a7a';

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
    const playbackRate = manifestRecord.playbackRate;
    const viewport = manifestRecord.viewport;

    if (!Array.isArray(panels)) {
        fail('Readme demo manifest has an invalid shape.');
    }

    if (
        typeof playbackRate !== 'number' ||
        !Number.isFinite(playbackRate) ||
        playbackRate <= 0
    ) {
        fail('Readme demo manifest must include a positive playback rate.');
    }

    if (!viewport || typeof viewport !== 'object') {
        fail('Readme demo manifest must include a viewport object.');
    }

    const validatedViewport = viewport as ReadmeDemoManifest['viewport'];
    const { width, height } = validatedViewport;

    if (
        typeof width !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isInteger(width) ||
        width <= 0 ||
        typeof height !== 'number' ||
        !Number.isFinite(height) ||
        !Number.isInteger(height) ||
        height <= 0
    ) {
        fail(
            'Readme demo manifest must include positive integer viewport dimensions.',
        );
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
            !Array.isArray(manifestPanel.addressPhases) ||
            manifestPanel.addressPhases.length === 0 ||
            typeof manifestPanel.label !== 'string' ||
            manifestPanel.label.length === 0 ||
            typeof manifestPanel.videoPath !== 'string' ||
            manifestPanel.videoPath.length === 0
        ) {
            fail(
                'Readme demo manifest includes a panel without address phases, label, or path.',
            );
        }

        let previousStartMs = -1;

        manifestPanel.addressPhases.forEach((phase, phaseIndex) => {
            if (!phase || typeof phase !== 'object') {
                fail(
                    `Readme demo panel ${manifestPanel.id} includes an invalid address phase.`,
                );
            }

            if (
                typeof phase.startMs !== 'number' ||
                !Number.isFinite(phase.startMs) ||
                phase.startMs < 0 ||
                !Number.isInteger(phase.startMs)
            ) {
                fail(
                    `Readme demo panel ${manifestPanel.id} has an invalid address phase start time.`,
                );
            }

            if (typeof phase.text !== 'string') {
                fail(
                    `Readme demo panel ${manifestPanel.id} has an invalid address phase text value.`,
                );
            }

            if (phase.startMs <= previousStartMs) {
                fail(
                    `Readme demo panel ${manifestPanel.id} address phases must be strictly increasing.`,
                );
            }

            if (phaseIndex === 0 && phase.startMs !== 0) {
                fail(
                    `Readme demo panel ${manifestPanel.id} must start its address phases at 0ms.`,
                );
            }

            previousStartMs = phase.startMs;
        });

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

const createPhaseEnableExpression = (
    addressPhases: ReadonlyArray<{
        startMs: number;
        text: string;
    }>,
    index: number,
): string => {
    const phase = addressPhases[index];
    const startSeconds = (phase.startMs / 1_000).toFixed(3);
    const nextPhase = addressPhases[index + 1];

    return nextPhase
        ? `gte(t,${startSeconds})*lt(t,${(nextPhase.startMs / 1_000).toFixed(3)})`
        : `gte(t,${startSeconds})`;
};

const createAddressTextFilters = (
    addressPhases: ReadonlyArray<{
        startMs: number;
        text: string;
    }>,
    panelMarkerText: string,
): string[] =>
    addressPhases.flatMap((phase, index) => {
        const enableExpression = createPhaseEnableExpression(
            addressPhases,
            index,
        );

        if (phase.text.length === 0) {
            const escapedPanelMarkerText = escapeDrawtext(panelMarkerText);

            return [
                `drawbox=x=0:y=0:w=iw:h=ih:color=${canvasColor}:t=fill:enable='${enableExpression}'`,
                `drawtext=text='${escapedPanelMarkerText}':x=(w-text_w)/2:y=(h+${panelLabelHeight}-text_h)/2:fontsize=46:fontcolor=${panelMarkerTextColor}:font='Courier New Bold':enable='${enableExpression}'`,
            ];
        }

        const escapedAddressText = escapeDrawtext(phase.text);

        return [
            `drawbox=x=0:y=${panelLabelHeight - 1}:w=iw:h=1:color=${labelDividerColor}:t=fill:enable='${enableExpression}'`,
            `drawtext=text='URL\\: ${escapedAddressText}':x=20:y=18:fontsize=18:fontcolor=${labelTextColor}:font='Courier New Bold':enable='${enableExpression}'`,
        ];
    });

const createFilterGraph = (manifest: ReadmeDemoManifest): string => {
    const panelWindowFilters = manifest.panels.map((panel, index) => {
        return [
            `[${index}:v]setpts=PTS/${manifest.playbackRate}`,
            `pad=w=iw:h=ih+${panelLabelHeight}:x=0:y=${panelLabelHeight}:color=${canvasColor}`,
            ...createAddressTextFilters(
                panel.addressPhases,
                `browser #${index + 1}`,
            ),
            `format=yuv420p[panel${index}]`,
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
                return `w0+${panelGap}_0`;
            }

            return `w0+w1+${panelGap * 2}_0`;
        })
        .join('|');

    return [
        ...panelWindowFilters,
        `${stackedInputs}xstack=inputs=${manifest.panels.length}:layout=${xstackLayout}:fill=${canvasColor},format=yuv420p[v]`,
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
    process.env.PLAYWRIGHT_CONFIG_PROFILE = 'readme-demo';
    ensureFfmpegAvailable();
    cleanDemoOutputDir();

    runPnpmSync(['build']);
    runPnpmSync([
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/config/playwright.config.mts',
        ...getForwardedCliArgs(),
    ]);

    stitchVideos(readManifest());
    console.log(`Readme demo video written to ${readmeDemoFinalVideoPath}`);
};

main();
