import type { FormEvent } from 'react';

import type { DerivedPollWorkflow } from '../poll-workflow';

import type { PollData } from './poll-page-types';

export type PollPageHeaderViewModel = {
    canCopyShareUrl: boolean;
    copyNotice: string | null;
    onCopyShareUrl: () => void;
    poll: PollData;
    primaryExplanation: string;
    shareUrl: string;
    submittedVoterSummary: string;
};

export type PollPageAlertsViewModel = {
    automationError: string | null;
    localError: string | null;
    localNotice: string | null;
};

export type PollPageVoteFormViewModel = {
    canSubmitVote: boolean;
    draftScores: (number | null)[];
    isSubmittingVote: boolean;
    onScoreChange: (choiceIndex: number, score: number) => void;
    onSubmitVote: (event: FormEvent<HTMLFormElement>) => void;
    setVoterName: (value: string) => void;
    voterName: string;
};

export type PollPageCreatorControlsViewModel = {
    isClosingVoting: boolean;
    isCreatorParticipant: boolean;
    onCloseVoting: () => void;
};

export type PollPageRestartCeremonyViewModel = {
    blockingVoters: PollData['voters'];
    canRestartCeremony: boolean;
    isRestartingCeremony: boolean;
    onRestartCeremony: () => void;
};

export type PollPageAutomationViewModel = {
    activeActionSlotKey: string | null;
    isResolvingAutomaticAction: boolean;
    onRetryAutomation: () => void;
};

export type PollPageLocalViewerViewModel = {
    isLocalVoter: boolean;
};

export type PollPageNextStepViewModel = {
    automation: PollPageAutomationViewModel;
    creatorControls: PollPageCreatorControlsViewModel;
    localViewer: PollPageLocalViewerViewModel;
    nextStepExplanation: string;
    poll: PollData;
    restartCeremony: PollPageRestartCeremonyViewModel;
    voteForm: PollPageVoteFormViewModel;
    workflow: DerivedPollWorkflow;
};

export type PollPageResultsViewModel = {
    poll: PollData;
};

export type PollPageAuditViewModel = {
    acceptedKeyConfirmations: number;
    acceptedManifestAcceptances: number;
    acceptedRegistrations: number;
    poll: PollData;
};

export type PollPageRefreshViewModel = {
    isFetching: boolean;
    isLoading: boolean;
};

export type PollPageReadyState = {
    alerts: PollPageAlertsViewModel;
    audit: PollPageAuditViewModel;
    header: PollPageHeaderViewModel;
    nextStep: PollPageNextStepViewModel;
    refresh: PollPageRefreshViewModel;
    results: PollPageResultsViewModel;
    status: 'ready';
};
