import { render, screen } from '@testing-library/react';

import { RenderErrorFallback } from './RenderErrorFallback';

describe('RenderErrorFallback', () => {
    it('hides render error details when details are disabled', () => {
        render(
            <RenderErrorFallback
                error={new Error('secret-token-value')}
                resetErrorBoundary={vi.fn()}
                showDetails={false}
            />,
        );

        expect(
            screen.getByRole('heading', {
                name: 'The application has crashed due to a rendering error.',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Refresh the page or try again later.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/secret-token-value/i),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    });

    it('shows render error details when details are enabled', () => {
        render(
            <RenderErrorFallback
                error={new Error('developer stack details')}
                resetErrorBoundary={vi.fn()}
                showDetails
            />,
        );

        expect(
            screen.getByText(
                'Inspect the details below to understand what failed during rendering.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/developer stack details/i),
        ).toBeInTheDocument();
    });
});
