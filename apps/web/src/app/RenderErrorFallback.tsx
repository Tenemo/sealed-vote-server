import { type FallbackProps } from 'react-error-boundary';

import { Panel } from '@/components/ui/panel';

const shouldShowRenderableErrorDetails = (): boolean => import.meta.env.DEV;

const formatRenderableError = (error: unknown): string => {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    try {
        return JSON.stringify(error, null, 4) ?? String(error);
    } catch {
        return String(error);
    }
};

type RenderErrorFallbackProps = FallbackProps & {
    showDetails?: boolean;
};

export const RenderErrorFallback = ({
    error,
    showDetails = shouldShowRenderableErrorDetails(),
}: RenderErrorFallbackProps): React.JSX.Element => (
    <div className="flex min-h-[50vh] items-center justify-center">
        <Panel className="w-full max-w-2xl space-y-4">
            <div className="space-y-2">
                <h1 className="page-title">
                    The application has crashed due to a rendering error.
                </h1>
                <p className="page-lead">
                    {showDetails
                        ? 'Inspect the details below to understand what failed during rendering.'
                        : 'Refresh the page or try again later.'}
                </p>
            </div>
            {showDetails && (
                <pre className="overflow-auto rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-6 whitespace-pre-wrap break-words text-secondary">
                    {formatRenderableError(error)}
                </pre>
            )}
        </Panel>
    </div>
);
