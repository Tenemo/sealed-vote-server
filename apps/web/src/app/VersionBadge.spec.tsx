import { render, screen, waitFor } from '@testing-library/react';

import VersionBadge from './VersionBadge';

describe('VersionBadge', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('renders the first 4 deployed commit characters in monospace-friendly text', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            json: async () => ({
                commitSha: '8A9F1234567890AB',
            }),
            ok: true,
        } as Response);

        render(<VersionBadge />);

        expect(await screen.findByText('Version: 8a9f')).toBeVisible();
    });

    it('uses inline flow on mobile and only becomes fixed from small screens up', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            json: async () => ({
                commitSha: '8A9F1234567890AB',
            }),
            ok: true,
        } as Response);

        render(<VersionBadge />);

        const badge = await screen.findByText('Version: 8a9f');

        expect(badge).toHaveClass('self-end');
        expect(badge).not.toHaveClass('fixed');
        expect(badge).toHaveClass('sm:fixed');
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
            expect(screen.queryByText(/^Version:/)).not.toBeInTheDocument();
        });
    });
});
