import React from 'react';
import { useParams } from 'react-router-dom';

import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import NotFound from 'components/NotFound/NotFound';

import PollPageContent from './PollPageContent';
import { usePollPageController } from './usePollPageController';

const PollLoadingState = (): React.JSX.Element => (
    <div className="flex min-h-[40vh] items-center justify-center">
        <Panel className="loading-panel max-w-xl">
            <Spinner className="size-10" />
        </Panel>
    </div>
);

const PollPage = (): React.JSX.Element => {
    const { pollSlug } = useParams();

    if (!pollSlug) {
        throw new Error('Poll slug missing.');
    }

    const controller = usePollPageController(pollSlug);

    if (controller.status === 'not-found') {
        return <NotFound />;
    }

    if (controller.status === 'loading') {
        return <PollLoadingState />;
    }

    return <PollPageContent controller={controller} />;
};

export default PollPage;
