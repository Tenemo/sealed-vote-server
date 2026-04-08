import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VoteSharing from './VoteSharing';

import { TooltipProvider } from '@/components/ui/tooltip';

const renderVoteSharing = (): void => {
    render(
        <TooltipProvider>
            <VoteSharing pollTitle="Best fruit" />
        </TooltipProvider>,
    );
};

describe('VoteSharing', () => {
    beforeAll(() => {
        class ResizeObserverMock {
            public disconnect(): void {}

            public observe(): void {}

            public unobserve(): void {}
        }

        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            value: ResizeObserverMock,
        });
    });

    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('shows success feedback after copying the vote link', async () => {
        const user = userEvent.setup();

        renderVoteSharing();

        await user.click(
            screen.getByRole('button', { name: 'Copy vote link' }),
        );

        expect(
            screen.getByText('Vote link copied to clipboard.'),
        ).toBeInTheDocument();
    });

    it('shows an error message when clipboard copy fails', async () => {
        const user = userEvent.setup();

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: vi.fn().mockRejectedValue(new Error('copy failed')),
            },
        });

        renderVoteSharing();

        await user.click(
            screen.getByRole('button', { name: 'Copy vote link' }),
        );

        expect(
            await screen.findByText(
                'Copy failed. Please copy the link manually.',
            ),
        ).toBeInTheDocument();
    });

    it('shares the vote link with the poll title when the share api is available', async () => {
        const user = userEvent.setup();
        const shareSpy = vi.fn().mockResolvedValue(undefined);

        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: shareSpy,
        });

        renderVoteSharing();

        await user.click(
            screen.getByRole('button', { name: 'Share vote link' }),
        );

        expect(shareSpy).toHaveBeenCalledWith({
            title: 'Best fruit',
            text: 'Best fruit',
            url: window.location.href,
        });
        expect(screen.getByText('Vote link shared.')).toBeInTheDocument();
    });
});
