const hexByte = (value: number): string => value.toString(16).padStart(2, '0');

export const generateClientToken = (): string => {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes, hexByte).join('');
};
