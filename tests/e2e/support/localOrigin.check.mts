import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isLocalLoopbackHostname,
    isLocalLoopbackUrl,
} from './localOrigin.mts';

test('isLocalLoopbackHostname accepts loopback hostnames across local variants', () => {
    assert.equal(isLocalLoopbackHostname('localhost'), true);
    assert.equal(isLocalLoopbackHostname('127.0.0.1'), true);
    assert.equal(isLocalLoopbackHostname('127.42.7.9'), true);
    assert.equal(isLocalLoopbackHostname('::1'), true);
    assert.equal(isLocalLoopbackHostname('[::1]'), true);
});

test('isLocalLoopbackHostname rejects non-loopback hostnames', () => {
    assert.equal(isLocalLoopbackHostname('128.0.0.1'), false);
    assert.equal(isLocalLoopbackHostname('sealed.vote'), false);
});

test('isLocalLoopbackUrl accepts local http and https origins', () => {
    assert.equal(
        isLocalLoopbackUrl('http://127.0.0.1:3000/votes/example--1234'),
        true,
    );
    assert.equal(
        isLocalLoopbackUrl('https://[::1]:4173/votes/example--1234'),
        true,
    );
});

test('isLocalLoopbackUrl rejects invalid and remote urls', () => {
    assert.equal(isLocalLoopbackUrl('not-a-url'), false);
    assert.equal(
        isLocalLoopbackUrl('https://sealed.vote/votes/example--1234'),
        false,
    );
});
