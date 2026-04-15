import { render, screen, waitFor } from '@testing-library/react';

import VersionBadge from './VersionBadge';

describe('VersionBadge', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('renders the first 4 deployed commit characters in compact debug text', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            json: async () => ({
                commitSha: '8A9F1234567890AB',
            }),
            ok: true,
        } as Response);

        render(<VersionBadge />);

        expect(await screen.findByText('v. 8a9f')).toBeVisible();
    });

    it('stays hidden when the deployment version cannot be loaded', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            json: async () => ({
                commitSha: null,
            }),
            ok: true,
        } as Response);

        render(<VersionBadge />);

        await waitFor(() => {
            expect(
                screen.queryByText(/^v\.\s[0-9a-f]{4}$/),
            ).not.toBeInTheDocument();
        });
    });
});
