import * as thresholdElgamal from 'threshold-elgamal';

const thresholdElgamalNamespace = thresholdElgamal as Record<string, unknown>;

const requiredFullCeremonyRootExports = [
    'createDisjunctiveProof',
    'createDLEQProof',
    'createSchnorrProof',
    'generatePedersenCommitments',
    'generateFeldmanCommitments',
    'getGroup',
] as const;

const missingFullCeremonyRootExports = requiredFullCeremonyRootExports.filter(
    (exportName) => typeof thresholdElgamalNamespace[exportName] !== 'function',
);

const supportsFullCeremonyAuthoring =
    missingFullCeremonyRootExports.length === 0;

const describeFullCeremonySupport = (): string =>
    supportsFullCeremonyAuthoring
        ? 'The installed threshold-elgamal build exposes the root-only authoring surface needed for the later DKG, ballot, and result-opening phases.'
        : `The installed threshold-elgamal build still lacks the root-only exports needed for the later DKG, ballot, and result-opening phases: ${missingFullCeremonyRootExports.join(', ')}.`;

export {
    describeFullCeremonySupport,
    missingFullCeremonyRootExports,
    requiredFullCeremonyRootExports,
    supportsFullCeremonyAuthoring,
};
