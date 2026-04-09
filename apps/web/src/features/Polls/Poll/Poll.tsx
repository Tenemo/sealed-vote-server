import React from 'react';
import { useParams } from 'react-router-dom';

import PollHeader from './PollHeader';
import { usePollPageState } from './usePollPageState';
import VoteResults from './VoteResults';
import Voting from './Voting/Voting';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { mutedBodyClassName, sectionTitleClassName } from '@/lib/uiClasses';
import DocumentSeo from 'app/DocumentSeo';
import NotFound from 'components/NotFound/NotFound';
import { connectionLostMessage, renderError } from 'utils/networkErrors';

const PollPage = (): React.JSX.Element => {
    const { pollSlug } = useParams();
    const participantsHeadingId = React.useId();

    if (!pollSlug) {
        throw new Error('Poll slug missing.');
    }
    const {
        effectiveCreatorToken,
        effectivePoll,
        isLoadingPoll,
        onVote,
        pageSeo,
        pollError,
        pollId,
        shouldShowConnectionState,
        shouldShowConnectionToast,
        shouldShowFatalError,
        shouldShowNotFound,
    } = usePollPageState(pollSlug);

    if (shouldShowNotFound) {
        return <NotFound />;
    }

    const hasPollData = !!pollId && !!effectivePoll;

    return (
        <>
            <DocumentSeo metadata={pageSeo} />
            {isLoadingPoll && !hasPollData && (
                <div className="flex flex-1 items-center justify-center">
                    <Spinner className="size-10" />
                </div>
            )}
            {shouldShowConnectionToast && (
                <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
                    <Alert
                        aria-live="polite"
                        className="pointer-events-auto w-full max-w-xl border-border/70 bg-background/95 shadow-lg backdrop-blur"
                        data-slot="connection-toast"
                        role="status"
                        variant="info"
                    >
                        <Spinner
                            aria-hidden="true"
                            className="size-4"
                            role="presentation"
                        />
                        <AlertDescription>
                            {connectionLostMessage} Showing the latest available
                            vote state and retrying in the background.
                        </AlertDescription>
                    </Alert>
                </div>
            )}
            {shouldShowConnectionState && (
                <Panel className="mx-auto flex flex-1 w-full max-w-2xl flex-col items-center justify-center gap-4 text-center">
                    <Spinner className="size-10" />
                    <div className="space-y-2">
                        <h1 className={sectionTitleClassName}>
                            Connection lost
                        </h1>
                        <p className={mutedBodyClassName}>
                            We lost the connection to the server. The app will
                            keep retrying in the background and will recover
                            automatically once the connection is back.
                        </p>
                    </div>
                </Panel>
            )}
            {shouldShowFatalError && (
                <Alert className="mx-auto mt-6 max-w-3xl" variant="destructive">
                    <AlertDescription>
                        {renderError(pollError)}
                    </AlertDescription>
                </Alert>
            )}
            {pollId && effectivePoll && (
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                    <PollHeader
                        creatorToken={effectiveCreatorToken}
                        poll={effectivePoll}
                        pollId={pollId}
                    />
                    <Voting
                        onVote={onVote}
                        poll={effectivePoll}
                        pollId={pollId}
                    />
                    <VoteResults poll={effectivePoll} pollId={pollId} />
                    <Panel asChild padding="compact" tone="surface">
                        <section aria-labelledby={participantsHeadingId}>
                            <h2
                                className="text-lg font-semibold tracking-tight"
                                id={participantsHeadingId}
                            >
                                Participants
                            </h2>
                            {effectivePoll.voters.length ? (
                                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {effectivePoll.voters.map((voterName) => (
                                        <Panel
                                            asChild
                                            className="min-w-0 break-words text-sm leading-6 text-foreground"
                                            key={voterName}
                                            padding="row"
                                            radius="compact"
                                            tone="subtle"
                                        >
                                            <li>{voterName}</li>
                                        </Panel>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                    No voters yet.
                                </p>
                            )}
                        </section>
                    </Panel>
                </div>
            )}
        </>
    );
};

export default PollPage;
