import type React from 'react';

import { Panel } from '@/components/ui/panel';

import {
    formatBoardEntryStatus,
    formatBoardEntryTitle,
    formatRevealStatus,
} from './poll-page-formatters';
import type { PollData } from './poll-page-types';

type PollAuditRailProps = {
    acceptedKeyConfirmations: number;
    acceptedManifestAcceptances: number;
    acceptedRegistrations: number;
    poll: PollData;
};

const PollAuditRail = ({
    acceptedKeyConfirmations,
    acceptedManifestAcceptances,
    acceptedRegistrations,
    poll,
}: PollAuditRailProps): React.JSX.Element => (
    <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Panel className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">
                    Audit and verification
                </h2>
                <p className="field-note">
                    The main flow hides the cryptography. This rail shows what
                    the board currently proves.
                </p>
            </div>

            <div className="space-y-3 text-sm">
                <div>
                    <div className="font-medium text-foreground">
                        Verification
                    </div>
                    <div className="text-secondary">
                        {poll.verification.status === 'verified'
                            ? 'Verified from the public board log.'
                            : (poll.verification.reason ??
                              'Waiting for enough public data to verify the full ceremony.')}
                    </div>
                </div>
                <div>
                    <div className="font-medium text-foreground">
                        Reconstruction threshold
                    </div>
                    <div className="text-secondary">
                        {poll.thresholds.reconstructionThreshold ??
                            'Pending close'}
                    </div>
                </div>
                <div>
                    <div className="font-medium text-foreground">
                        Minimum published voter count
                    </div>
                    <div className="text-secondary">
                        {poll.thresholds.minimumPublishedVoterCount ??
                            'Pending close'}
                    </div>
                </div>
                {poll.sessionFingerprint ? (
                    <div>
                        <div className="font-medium text-foreground">
                            Session fingerprint
                        </div>
                        <div className="text-secondary break-all">
                            {poll.sessionFingerprint}
                        </div>
                    </div>
                ) : null}
            </div>
        </Panel>

        <Panel className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Ceremony progress</h2>
                <p className="field-note">
                    Counts are derived from the accepted board log.
                </p>
            </div>

            <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Submitted voters</span>
                    <span>{poll.submittedVoterCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">
                        Active ceremony roster
                    </span>
                    <span>{poll.ceremony.activeParticipantCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Board registrations</span>
                    <span>
                        {acceptedRegistrations}/
                        {poll.ceremony.activeParticipantCount}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Manifest acceptances</span>
                    <span>
                        {acceptedManifestAcceptances}/
                        {poll.ceremony.activeParticipantCount}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Key confirmations</span>
                    <span>
                        {acceptedKeyConfirmations}/
                        {poll.ceremony.activeParticipantCount}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">
                        Complete encrypted ballots
                    </span>
                    <span>
                        {poll.ceremony.completeEncryptedBallotParticipantCount}/
                        {poll.ceremony.activeParticipantCount}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Decryption shares</span>
                    <span>{poll.ceremony.acceptedDecryptionShareCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Reveal status</span>
                    <span>{formatRevealStatus(poll)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Ceremony restarts</span>
                    <span>{poll.ceremony.restartCount}</span>
                </div>
            </div>
        </Panel>

        <Panel className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Voters</h2>
                <p className="field-note">
                    The pre-close roster is public and auditable.
                </p>
            </div>

            <ul aria-label="Voters roster" className="space-y-2">
                {poll.voters.map((voter) => (
                    <li
                        className="rounded-[var(--radius-md)] border border-border/70 bg-background px-4 py-3 text-sm"
                        key={voter.voterIndex}
                    >
                        <div className="font-medium text-foreground">
                            {voter.voterIndex}. {voter.voterName}
                        </div>
                        <div className="text-secondary">
                            {voter.deviceReady
                                ? 'Device keys submitted'
                                : 'Device keys pending'}
                            {voter.ceremonyState === 'blocking'
                                ? ' | currently blocking the active ceremony'
                                : voter.ceremonyState === 'skipped'
                                  ? ' | skipped from the active ceremony'
                                  : ''}
                        </div>
                    </li>
                ))}
            </ul>
        </Panel>

        <Panel className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold">Board activity</h2>
                <p className="field-note">
                    Digests and message counts come from the accepted bulletin
                    board log.
                </p>
            </div>

            <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Accepted</span>
                    <span>{poll.boardAudit.acceptedCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Duplicates</span>
                    <span>{poll.boardAudit.duplicateCount}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-secondary">Equivocations</span>
                    <span>{poll.boardAudit.equivocationCount}</span>
                </div>
                {poll.boardAudit.ceremonyDigest ? (
                    <div>
                        <div className="font-medium text-foreground">
                            Ceremony digest
                        </div>
                        <div className="text-secondary break-all">
                            {poll.boardAudit.ceremonyDigest}
                        </div>
                    </div>
                ) : null}
                {poll.boardAudit.phaseDigests.length ? (
                    <div className="space-y-2">
                        <div className="font-medium text-foreground">
                            Phase digests
                        </div>
                        <ul className="space-y-2">
                            {poll.boardAudit.phaseDigests.map((digest) => (
                                <li
                                    className="rounded-[var(--radius-md)] border border-border/70 bg-background px-3 py-3"
                                    key={`${digest.phase}-${digest.digest}`}
                                >
                                    <div className="font-medium text-foreground">
                                        Phase {digest.phase}
                                    </div>
                                    <div className="text-secondary break-all">
                                        {digest.digest}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {poll.boardEntries.length ? (
                    <div className="space-y-2">
                        <div className="font-medium text-foreground">
                            Latest entries
                        </div>
                        <div className="space-y-2">
                            {poll.boardEntries
                                .slice(-8)
                                .reverse()
                                .map((entry) => (
                                    <div
                                        className="rounded-[var(--radius-md)] border border-border/70 bg-background px-3 py-3 text-sm"
                                        key={entry.id}
                                    >
                                        <div className="font-medium text-foreground">
                                            {formatBoardEntryTitle(entry, poll)}
                                        </div>
                                        <div className="text-secondary">
                                            {formatBoardEntryStatus(entry)}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </Panel>
    </div>
);

export default PollAuditRail;
