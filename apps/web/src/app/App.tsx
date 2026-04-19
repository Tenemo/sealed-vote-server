import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, Routes } from 'react-router-dom';

import { RenderErrorFallback } from './RenderErrorFallback';
import VersionBadge from './VersionBadge';

import Header from 'components/Header/Header';
import NotFound from 'components/NotFound/NotFound';
import PollPage from 'features/polls/PollPage/PollPage';
import PollCreationPage from 'features/polls/PollCreationPage/PollCreationPage';

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
        <div className="app-shell flex min-h-[100dvh] flex-col">
            <a
                className="skip-link"
                href="#main-content"
                onClick={focusMainContent}
            >
                Skip to main content
            </a>
            <ErrorBoundary
                FallbackComponent={RenderErrorFallback}
                onError={(error) => console.error(error)}
            >
                <Header />
                <main
                    className="flex flex-1 justify-center px-4 pb-10 pt-6 focus:outline-none focus-visible:outline-none sm:px-6 sm:pb-14 sm:pt-8"
                    id="main-content"
                    ref={mainContentReference}
                >
                    <div className="flex w-full max-w-[96rem] flex-1 flex-col">
                        <Routes>
                            <Route element={<PollCreationPage />} path="/" />
                            <Route
                                element={<PollPage />}
                                path="polls/:pollSlug"
                            />
                            <Route element={<NotFound />} path="*" />
                        </Routes>
                    </div>
                </main>
                <VersionBadge />
            </ErrorBoundary>
        </div>
    );
};

export default App;
