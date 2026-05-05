import assert from 'node:assert/strict';
import test from 'node:test';

import {
    closeParticipant,
    openProjectParticipant,
    reopenProjectParticipant,
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

test('closeParticipant closes context-owned participants through the context', async () => {
    const participantDouble = createParticipantDouble();

    await closeParticipant(participantDouble.participant);

    assert.equal(participantDouble.pageCloseCalls, 0);
    assert.equal(participantDouble.contextCloseCalls, 1);
    assert.equal(participantDouble.participant.isClosed, true);
});

test('closeParticipant is idempotent for already-closed participants', async () => {
    const participantDouble = createParticipantDouble();

    await closeParticipant(participantDouble.participant);
    await closeParticipant(participantDouble.participant);

    assert.equal(participantDouble.pageCloseCalls, 0);
    assert.equal(participantDouble.contextCloseCalls, 1);
});

test('closeParticipant skips context.close for page-only participants', async () => {
    const participantDouble = createParticipantDouble();
    participantDouble.participant.closeMode = 'page-only';

    await closeParticipant(participantDouble.participant);

    assert.equal(participantDouble.pageCloseCalls, 1);
    assert.equal(participantDouble.contextCloseCalls, 0);
});

test('openProjectParticipant closes project participants at the context level', async () => {
    const pageDouble = {};
    const contextDouble = {
        newPage: async () => pageDouble,
    };
    const browserDouble = {
        newContext: async () => contextDouble,
    };
    const testInfoDouble = {
        project: {
            name: 'firefox-desktop',
            use: {
                browserName: 'firefox',
            },
        },
    };

    const participant = await openProjectParticipant(
        browserDouble as never,
        testInfoDouble as never,
    );

    assert.equal(participant.closeMode, 'context');
});

test('reopenProjectParticipant closes restored project participants at the context level', async () => {
    const pageDouble = {};
    const contextDouble = {
        newPage: async () => pageDouble,
    };
    const browserDouble = {
        newContext: async () => contextDouble,
    };
    const testInfoDouble = {
        project: {
            name: 'firefox-desktop',
            use: {
                browserName: 'firefox',
            },
        },
    };

    const participant = await reopenProjectParticipant({
        browser: browserDouble as never,
        storageState: { cookies: [], origins: [] },
        testInfo: testInfoDouble as never,
    });

    assert.equal(participant.closeMode, 'context');
});
