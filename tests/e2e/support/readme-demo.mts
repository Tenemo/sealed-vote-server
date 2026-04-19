import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '..', '..', '..');

export const readmeDemoPanelViewport = {
    width: 800,
    height: 1100,
} as const;

export const readmeDemoPlaybackRate = 1;
export const readmeDemoOutputDir = path.resolve(
    repositoryRoot,
    'test-results',
    'readme-demo',
);
export const readmeDemoRawVideoDir = path.resolve(readmeDemoOutputDir, 'raw');
export const readmeDemoManifestPath = path.resolve(
    readmeDemoOutputDir,
    'manifest.json',
);
export const readmeDemoFinalVideoPath = path.resolve(
    readmeDemoOutputDir,
    'sealed-vote-demo.mp4',
);

export type ReadmeDemoPanelId =
    | 'creator'
    | 'participant-one'
    | 'participant-two';

export type ReadmeDemoAddressPhase = {
    startMs: number;
    text: string;
};

export type ReadmeDemoManifest = {
    panels: Array<{
        addressPhases: ReadonlyArray<ReadmeDemoAddressPhase>;
        id: ReadmeDemoPanelId;
        label: string;
        videoPath: string;
    }>;
    playbackRate: number;
    viewport: {
        height: number;
        width: number;
    };
};
