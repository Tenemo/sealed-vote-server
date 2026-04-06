import React, { Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Helmet } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';

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
      <ErrorBoundary
        fallback={
          <div>The application has crashed due to a rendering error.</div>
        }
        onError={(error) => console.error(error)}
      >
        <Header />
        <main className="flex w-full flex-col items-center">
          <Routes>
            <Route element={<PollCreation />} path="/" />
            <Route
              element={
                <Suspense fallback={<Spinner className="mt-5 size-6" />}>
                  <Poll />
                </Suspense>
              }
              path="votes/:pollSlug"
            />
            <Route element={<NotFound />} path="*" />
          </Routes>
        </main>
      </ErrorBoundary>
    </>
  );
};

export default App;
