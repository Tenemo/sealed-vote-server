import { Box, CircularProgress } from '@mui/material';
import React, { Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Helmet } from 'react-helmet-async';
import { Route, Routes } from 'react-router-dom';
import 'normalize.css';

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
                    <div>
                        The application has crashed due to a rendering error.
                    </div>
                }
                onError={(error) => console.error(error)}
            >
                <Header />
                <Box
                    component="main"
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                    }}
                >
                    <Routes>
                        <Route element={<PollCreation />} path="/" />
                        <Route
                            element={
                                <Suspense
                                    fallback={
                                        <CircularProgress sx={{ mt: 5 }} />
                                    }
                                >
                                    <Poll />
                                </Suspense>
                            }
                            path="votes/:pollId"
                        />
                        <Route element={<NotFound />} path="*" />
                    </Routes>
                </Box>
            </ErrorBoundary>
        </>
    );
};

export default App;
