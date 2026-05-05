import type React from 'react';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

import { formatDateTime, phaseLabel } from './poll-page-formatters';
import type { PollData } from './poll-page-types';

type PollHeaderPanelProps = {
    canCopyShareUrl: boolean;
    copyNotice: string | null;
    onCopyShareUrl: () => void;
    poll: PollData;
    primaryExplanation: string;
    shareUrl: string;
    submittedVoterSummary: string;
};

const PollHeaderPanel = ({
    canCopyShareUrl,
    copyNotice,
    onCopyShareUrl,
    poll,
    primaryExplanation,
    shareUrl,
    submittedVoterSummary,
}: PollHeaderPanelProps): React.JSX.Element => (
    <Panel className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
                <p className="text-sm text-secondary">
                    {phaseLabel(poll.phase)}
                </p>
                <h1 className="page-title">{poll.pollName}</h1>
                <p className="page-lead max-w-3xl">{primaryExplanation}</p>
            </div>
            <div className="grid gap-2 text-sm text-secondary sm:grid-cols-2 lg:grid-cols-1">
                <div>
                    <div className="font-medium text-foreground">Created</div>
                    <div>{formatDateTime(poll.createdAt)}</div>
                </div>
                <div>
                    <div className="font-medium text-foreground">
                        Submitted voters
                    </div>
                    <div>{submittedVoterSummary}</div>
                </div>
            </div>
        </div>

        <div className="space-y-2">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">
                        Shareable poll link
                    </div>
                    <div
                        className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-3 text-sm break-all"
                        data-testid="share-url-value"
                    >
                        {shareUrl}
                    </div>
                </div>
                <Button
                    data-testid="copy-link-button"
                    disabled={!canCopyShareUrl}
                    onClick={onCopyShareUrl}
                    size="lg"
                    variant="outline"
                >
                    Copy link
                </Button>
            </div>
            <p aria-live="polite" className="field-note min-h-6">
                {copyNotice}
            </p>
        </div>
    </Panel>
);

export default PollHeaderPanel;
