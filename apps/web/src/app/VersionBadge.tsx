import React from 'react';

const deploymentVersionPath = '/version.json';
const commitShaPattern = /^[0-9a-f]{4,40}$/i;

type DeploymentVersionResponse = {
    commitSha?: unknown;
};

const formatDisplayedVersion = (commitSha: unknown): string | null => {
    if (typeof commitSha !== 'string') {
        return null;
    }

    const normalizedCommitSha = commitSha.trim().toLowerCase();

    if (!commitShaPattern.test(normalizedCommitSha)) {
        return null;
    }

    return normalizedCommitSha.slice(0, 4);
};

const VersionBadge = (): React.JSX.Element => {
    const [displayedVersion, setDisplayedVersion] = React.useState<
        string | null
    >(null);

    React.useEffect(() => {
        let isDisposed = false;

        void fetch(deploymentVersionPath)
            .then(async (response) => {
                if (!response.ok) {
                    return null;
                }

                return (await response.json()) as DeploymentVersionResponse;
            })
            .then((payload) => {
                if (isDisposed) {
                    return;
                }

                setDisplayedVersion(formatDisplayedVersion(payload?.commitSha));
            })
            .catch(() => {
                if (isDisposed) {
                    return;
                }

                setDisplayedVersion(null);
            });

        return () => {
            isDisposed = true;
        };
    }, []);

    if (!displayedVersion) {
        return <></>;
    }

    return (
        <div className="pointer-events-none fixed bottom-3 right-3 z-40 rounded-md border border-border/70 bg-background/90 px-2.5 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
            Version: {displayedVersion}
        </div>
    );
};

export default VersionBadge;
