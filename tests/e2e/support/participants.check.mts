import assert from 'node:assert/strict';
import test from 'node:test';

import {
    closeParticipant,
    type ManagedParticipant,
} from './participants.ts';

const createParticipantDouble = (): {
    contextCloseCalls: number;
    pageCloseCalls: number;
    participant: ManagedParticipant;
} => {
    let contextCloseCalls = 0;
    let pageCloseCalls = 0;
    let pageClosed = false;

    const page = {
        close: async () => {
            pageCloseCalls += 1;
            pageClosed = true;
        },
        isClosed: () => pageClosed,
    };
    const context = {
        close: async () => {
            contextCloseCalls += 1;
        },
        pages: () => [page],
    };

    return {
        get contextCloseCalls() {
            return contextCloseCalls;
        },
        get pageCloseCalls() {
            return pageCloseCalls;
        },
        participant: {
            context: context as ManagedParticipant['context'],
            isClosed: false,
            page: page as ManagedParticipant['page'],
        },
    };
};

test('closeParticipant closes open pages before closing the context', async () => {
    const participantDouble = createParticipantDouble();

    await closeParticipant(participantDouble.participant);

    assert.equal(participantDouble.pageCloseCalls, 1);
    assert.equal(participantDouble.contextCloseCalls, 1);
    assert.equal(participantDouble.participant.isClosed, true);
});

test('closeParticipant is idempotent for already-closed participants', async () => {
    const participantDouble = createParticipantDouble();

    await closeParticipant(participantDouble.participant);
    await closeParticipant(participantDouble.participant);

    assert.equal(participantDouble.pageCloseCalls, 1);
    assert.equal(participantDouble.contextCloseCalls, 1);
});

test('closeParticipant skips context.close for page-only participants', async () => {
    const participantDouble = createParticipantDouble();
    participantDouble.participant.closeMode = 'page-only';

    await closeParticipant(participantDouble.participant);

    assert.equal(participantDouble.pageCloseCalls, 1);
    assert.equal(participantDouble.contextCloseCalls, 0);
});
