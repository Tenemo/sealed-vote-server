import React, { Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Helmet } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import Header from 'components/Header/Header';
import NotFound from 'components/NotFound/NotFound';
import PollCreation from 'features/Polls/PollCreation/PollCreation';

const Poll = lazy(() => import('features/Polls/Poll/Poll'));

const App = (): React.JSX.Element => {
    return (
        <>
            <Helmet>
                <title>sealed.vote</title>
            </Helmet>
            <div className="flex min-h-full flex-col">
                <ErrorBoundary
                    fallback={
                        <main className="flex flex-1 items-center justify-center px-4 py-10">
                            <Alert
                                className="w-full max-w-xl"
                                variant="destructive"
                            >
                                <AlertDescription>
                                    The application crashed due to a rendering
                                    error.
                                </AlertDescription>
                            </Alert>
                        </main>
                    }
                    onError={(error) => console.error(error)}
                >
                    <Header />
                    <main className="flex flex-1 justify-center px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-8">
                        <div className="w-full max-w-4xl">
                            <Routes>
                                <Route element={<PollCreation />} path="/" />
                                <Route
                                    element={
                                        <Suspense
                                            fallback={
                                                <div className="flex min-h-[50vh] items-center justify-center">
                                                    <Spinner className="size-10" />
                                                </div>
                                            }
                                        >
                                            <Poll />
                                        </Suspense>
                                    }
                                    path="votes/:pollSlug"
                                />
                                <Route element={<NotFound />} path="*" />
                            </Routes>
                        </div>
                    </main>
                </ErrorBoundary>
            </div>
        </>
    );
};

export default App;
