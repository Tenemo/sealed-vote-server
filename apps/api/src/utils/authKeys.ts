const hexToBytes = (hexValue: string): Uint8Array => {
    const normalized = hexValue.trim();

    if (normalized.length === 0 || normalized.length % 2 !== 0) {
        throw new TypeError('Expected an even-length hex string.');
    }

    if (!/^[\da-fA-F]+$/.test(normalized)) {
        throw new TypeError('Expected a valid hex string.');
    }

    const bytes = new Uint8Array(normalized.length / 2);

    for (let index = 0; index < normalized.length; index += 2) {
        const parsedByte = Number.parseInt(
            normalized.slice(index, index + 2),
            16,
        );

        if (Number.isNaN(parsedByte)) {
            throw new TypeError('Expected a valid hex string.');
        }

        bytes[index / 2] = parsedByte;
    }

    return bytes;
};

const toArrayBuffer = (hexValue: string): ArrayBuffer => {
    const bytes = hexToBytes(hexValue);
    return bytes.buffer as ArrayBuffer;
};

const copyBytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
};

export const importAuthPublicKey = async (
    authPublicKey: string,
): Promise<CryptoKey> =>
    await crypto.subtle.importKey(
        'spki',
        toArrayBuffer(authPublicKey),
        {
            name: 'Ed25519',
        },
        false,
        ['verify'],
    );

export const verifyAuthSignature = async ({
    publicKey,
    payloadBytes,
    signature,
}: {
    payloadBytes: Uint8Array;
    publicKey: CryptoKey;
    signature: string;
}): Promise<boolean> =>
    await crypto.subtle.verify(
        'Ed25519',
        publicKey,
        toArrayBuffer(signature),
        copyBytesToArrayBuffer(payloadBytes),
    );
