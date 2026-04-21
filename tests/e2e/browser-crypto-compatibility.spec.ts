import { expect, test, type Page, type Route } from '@playwright/test';

const browserCompatibilityProbeUrl = 'https://compat.sealed.vote/';
const nonMacOsWebKitCryptoSkipReason =
    'Non-macOS Playwright WebKit does not expose the latest Apple WebKit WebCrypto support for Ed25519 and X25519. Run these checks on macOS.';

const openSecureProbePage = async (page: Page): Promise<void> => {
    const fulfillProbePage = async (route: Route): Promise<void> => {
        await route.fulfill({
            body: '<!doctype html><title>browser crypto compatibility</title><main>browser crypto compatibility</main>',
            contentType: 'text/html',
            status: 200,
        });
    };

    await page.route(browserCompatibilityProbeUrl, fulfillProbePage);

    try {
        await page.goto(browserCompatibilityProbeUrl, {
            waitUntil: 'domcontentloaded',
        });
    } finally {
        // Firefox intermittently fails to tear down the first reused context in
        // this file when the top-level route handler is still registered.
        await page.unroute(browserCompatibilityProbeUrl, fulfillProbePage);
    }
};

const shouldSkipModernWebKitCryptoProbe = (browserName: string): boolean =>
    browserName === 'webkit' && process.platform !== 'darwin';

test.beforeEach(async ({ page }) => {
    await openSecureProbePage(page);
});

// This probe intentionally exercises browser APIs directly. It exists to catch
// runtime and CI image regressions where WebCrypto support changes underneath
// the app's device-backed voting flow.
test('provides subtle crypto in a secure context', async ({ page }) => {
    const result = await page.evaluate(() => ({
        hasSubtleCrypto: Boolean(globalThis.crypto?.subtle),
        isSecureContext,
    }));

    expect(result).toEqual({
        hasSubtleCrypto: true,
        isSecureContext: true,
    });
});

test('supports Ed25519 generation, export, import, signing, and verification', async ({
    browserName,
    page,
}) => {
    test.skip(
        shouldSkipModernWebKitCryptoProbe(browserName),
        nonMacOsWebKitCryptoSkipReason,
    );

    const result = await page.evaluate(async () => {
        const message = new TextEncoder().encode(
            'sealed-vote-browser-crypto-ed25519',
        );
        const algorithm = { name: 'Ed25519' } as const;
        const keyPair = await crypto.subtle.generateKey(algorithm, true, [
            'sign',
            'verify',
        ]);
        const [privateKeyPkcs8, publicKeySpki] = await Promise.all([
            crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
            crypto.subtle.exportKey('spki', keyPair.publicKey),
        ]);
        const importedPrivateKey = await crypto.subtle.importKey(
            'pkcs8',
            privateKeyPkcs8,
            algorithm,
            false,
            ['sign'],
        );
        const importedPublicKey = await crypto.subtle.importKey(
            'spki',
            publicKeySpki,
            algorithm,
            true,
            ['verify'],
        );
        const signature = await crypto.subtle.sign(
            algorithm,
            importedPrivateKey,
            message,
        );
        const verified = await crypto.subtle.verify(
            algorithm,
            importedPublicKey,
            signature,
            message,
        );

        return {
            privateKeyAlgorithm: importedPrivateKey.algorithm.name,
            privateKeyPkcs8Bytes: privateKeyPkcs8.byteLength,
            publicKeyAlgorithm: importedPublicKey.algorithm.name,
            publicKeySpkiBytes: publicKeySpki.byteLength,
            signatureBytes: signature.byteLength,
            verified,
        };
    });

    expect(result.privateKeyAlgorithm).toBe('Ed25519');
    expect(result.publicKeyAlgorithm).toBe('Ed25519');
    expect(result.privateKeyPkcs8Bytes).toBeGreaterThan(0);
    expect(result.publicKeySpkiBytes).toBeGreaterThan(0);
    expect(result.signatureBytes).toBeGreaterThan(0);
    expect(result.verified).toBe(true);
});

test('supports X25519 generation, export, import, and shared-secret derivation', async ({
    browserName,
    page,
}) => {
    test.skip(
        shouldSkipModernWebKitCryptoProbe(browserName),
        nonMacOsWebKitCryptoSkipReason,
    );

    const result = await page.evaluate(async () => {
        const algorithm = { name: 'X25519' } as const;
        const [alice, bob] = await Promise.all([
            crypto.subtle.generateKey(algorithm, true, ['deriveBits']),
            crypto.subtle.generateKey(algorithm, true, ['deriveBits']),
        ]);
        const [
            alicePrivateKeyPkcs8,
            alicePublicKeyRaw,
            bobPrivateKeyPkcs8,
            bobPublicKeyRaw,
        ] = await Promise.all([
            crypto.subtle.exportKey('pkcs8', alice.privateKey),
            crypto.subtle.exportKey('raw', alice.publicKey),
            crypto.subtle.exportKey('pkcs8', bob.privateKey),
            crypto.subtle.exportKey('raw', bob.publicKey),
        ]);
        const importedAlicePrivateKey = await crypto.subtle.importKey(
            'pkcs8',
            alicePrivateKeyPkcs8,
            algorithm,
            false,
            ['deriveBits'],
        );
        const importedAlicePublicKey = await crypto.subtle.importKey(
            'raw',
            alicePublicKeyRaw,
            algorithm,
            true,
            [],
        );
        const importedBobPrivateKey = await crypto.subtle.importKey(
            'pkcs8',
            bobPrivateKeyPkcs8,
            algorithm,
            false,
            ['deriveBits'],
        );
        const importedBobPublicKey = await crypto.subtle.importKey(
            'raw',
            bobPublicKeyRaw,
            algorithm,
            true,
            [],
        );
        const [aliceSharedSecret, bobSharedSecret] = await Promise.all([
            crypto.subtle.deriveBits(
                {
                    ...algorithm,
                    public: importedBobPublicKey,
                },
                importedAlicePrivateKey,
                256,
            ),
            crypto.subtle.deriveBits(
                {
                    ...algorithm,
                    public: importedAlicePublicKey,
                },
                importedBobPrivateKey,
                256,
            ),
        ]);
        const aliceSharedSecretBytes = Array.from(
            new Uint8Array(aliceSharedSecret),
        );
        const bobSharedSecretBytes = Array.from(new Uint8Array(bobSharedSecret));

        return {
            alicePrivateKeyAlgorithm: importedAlicePrivateKey.algorithm.name,
            alicePrivateKeyPkcs8Bytes: alicePrivateKeyPkcs8.byteLength,
            alicePublicKeyAlgorithm: importedAlicePublicKey.algorithm.name,
            alicePublicKeyRawBytes: alicePublicKeyRaw.byteLength,
            bobPrivateKeyAlgorithm: importedBobPrivateKey.algorithm.name,
            bobPrivateKeyPkcs8Bytes: bobPrivateKeyPkcs8.byteLength,
            bobPublicKeyAlgorithm: importedBobPublicKey.algorithm.name,
            bobPublicKeyRawBytes: bobPublicKeyRaw.byteLength,
            sharedSecretBytes: aliceSharedSecret.byteLength,
            sharedSecretsMatch:
                aliceSharedSecretBytes.length === bobSharedSecretBytes.length &&
                aliceSharedSecretBytes.every(
                    (byte, index) => byte === bobSharedSecretBytes[index],
                ),
        };
    });

    expect(result.alicePrivateKeyAlgorithm).toBe('X25519');
    expect(result.alicePublicKeyAlgorithm).toBe('X25519');
    expect(result.bobPrivateKeyAlgorithm).toBe('X25519');
    expect(result.bobPublicKeyAlgorithm).toBe('X25519');
    expect(result.alicePrivateKeyPkcs8Bytes).toBeGreaterThan(0);
    expect(result.bobPrivateKeyPkcs8Bytes).toBeGreaterThan(0);
    expect(result.alicePublicKeyRawBytes).toBe(32);
    expect(result.bobPublicKeyRawBytes).toBe(32);
    expect(result.sharedSecretBytes).toBe(32);
    expect(result.sharedSecretsMatch).toBe(true);
});
