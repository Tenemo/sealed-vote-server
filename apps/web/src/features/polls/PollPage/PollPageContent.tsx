import type React from 'react';

import PollAuditRail from './PollAuditRail';
import PollHeaderPanel from './PollHeaderPanel';
import PollNextStepPanel from './PollNextStepPanel';
import PollResultsPanel from './PollResultsPanel';
import PollStatusAlerts from './PollStatusAlerts';
import type { PollPageReadyState } from './poll-page-view-models';

type PollPageContentProps = {
    controller: PollPageReadyState;
};

const PollPageContent = ({
    controller,
}: PollPageContentProps): React.JSX.Element => (
    <section className="mx-auto w-full max-w-[96rem] space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(21rem,1fr)]">
            <div className="space-y-6">
                <PollHeaderPanel header={controller.header} />

                <PollStatusAlerts alerts={controller.alerts} />

                <PollNextStepPanel nextStep={controller.nextStep} />

                <PollResultsPanel results={controller.results} />
            </div>

            <PollAuditRail audit={controller.audit} />
        </div>

        {(controller.refresh.isLoading || controller.refresh.isFetching) && (
            <div aria-live="polite" className="sr-only">
                Refreshing poll state
            </div>
        )}
    </section>
);

export default PollPageContent;
