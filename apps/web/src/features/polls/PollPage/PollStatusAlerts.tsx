import type React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';

import type { PollPageAlertsViewModel } from './poll-page-view-models';

type PollStatusAlertsProps = {
    alerts: PollPageAlertsViewModel;
};

const PollStatusAlerts = ({
    alerts: { automationError, localError, localNotice },
}: PollStatusAlertsProps): React.JSX.Element | null => {
    if (!localError && !automationError && !localNotice) {
        return null;
    }

    return (
        <div className="space-y-3">
            {localError ? (
                <Alert announcement="assertive" variant="destructive">
                    <AlertDescription>{localError}</AlertDescription>
                </Alert>
            ) : null}
            {automationError ? (
                <Alert announcement="polite" variant="destructive">
                    <AlertDescription>{automationError}</AlertDescription>
                </Alert>
            ) : null}
            {localNotice ? (
                <Alert announcement="polite" variant="success">
                    <AlertDescription>{localNotice}</AlertDescription>
                </Alert>
            ) : null}
        </div>
    );
};

export default PollStatusAlerts;
