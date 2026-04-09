import React, { Suspense, lazy } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Route, Routes } from 'react-router-dom';

import VersionBadge from './VersionBadge';

import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import Header from 'components/Header/Header';
import NotFound from 'components/NotFound/NotFound';
import PollCreation from 'features/Polls/PollCreation/PollCreation';

const Poll = lazy(() => import('features/Polls/Poll/Poll'));

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

const RenderErrorFallback = ({ error }: FallbackProps): React.JSX.Element => (
    <div className="flex min-h-[50vh] items-center justify-center">
        <Panel className="w-full max-w-2xl space-y-4">
            <div className="space-y-2">
                <h1 className="page-title">
                    The application has crashed due to a rendering error.
                </h1>
                <p className="page-lead">
                    Inspect the details below to understand what failed during
                    rendering.
                </p>
            </div>
            <pre className="overflow-auto rounded-[var(--radius-md)] border border-border bg-card p-4 text-sm leading-6 whitespace-pre-wrap break-words text-secondary">
                {formatRenderableError(error)}
            </pre>
        </Panel>
    </div>
);

const App = (): React.JSX.Element => {
    const mainContentReference = React.useRef<HTMLElement>(null);

    const clearMainContentFocusability = React.useCallback((): void => {
        mainContentReference.current?.removeAttribute('tabindex');
    }, []);

    const focusMainContent = React.useCallback((): void => {
        const doFocus = (): void => {
            const mainContent = mainContentReference.current;

            if (!mainContent) {
                return;
            }

            mainContent.setAttribute('tabindex', '-1');
            mainContent.focus();
        };

        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(doFocus);
            return;
        }

        window.setTimeout(doFocus, 0);
    }, []);

    React.useEffect(() => {
        const clearMainContentFocusabilityWhenFocusMoves = (
            event: FocusEvent,
        ): void => {
            if (event.target !== mainContentReference.current) {
                clearMainContentFocusability();
            }
        };

        document.addEventListener(
            'focusin',
            clearMainContentFocusabilityWhenFocusMoves,
        );

        return () => {
            document.removeEventListener(
                'focusin',
                clearMainContentFocusabilityWhenFocusMoves,
            );
        };
    }, [clearMainContentFocusability]);

    return (
        <div className="flex min-h-full flex-col">
            <a
                className="skip-link"
                href="#main-content"
                onClick={focusMainContent}
            >
                Skip to main content
            </a>
            <Header />
            <main
                className="flex flex-1 justify-center px-4 pb-10 pt-6 focus:outline-none focus-visible:outline-none sm:px-6 sm:pb-14 sm:pt-8"
                id="main-content"
                ref={mainContentReference}
            >
                <div className="flex w-full max-w-4xl flex-1 flex-col">
                    <ErrorBoundary
                        FallbackComponent={RenderErrorFallback}
                        onError={(error) => console.error(error)}
                    >
                        <Suspense
                            fallback={
                                <div className="flex min-h-[40vh] items-center justify-center">
                                    <Panel className="loading-panel max-w-xl">
                                        <Spinner className="size-10" />
                                    </Panel>
                                </div>
                            }
                        >
                            <Routes>
                                <Route element={<PollCreation />} path="/" />
                                <Route
                                    element={<Poll />}
                                    path="votes/:pollSlug"
                                />
                                <Route element={<NotFound />} path="*" />
                            </Routes>
                        </Suspense>
                    </ErrorBoundary>
                </div>
            </main>
            <VersionBadge />
        </div>
    );
};

export default App;
