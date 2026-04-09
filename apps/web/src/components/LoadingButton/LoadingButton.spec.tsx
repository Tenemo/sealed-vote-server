import { render, screen } from '@testing-library/react';

import LoadingButton from './LoadingButton';

describe('LoadingButton', () => {
    it('uses the loading label and disables the button while work is pending', () => {
        render(
            <LoadingButton loading loadingLabel="Creating vote">
                Create vote
            </LoadingButton>,
        );

        const button = screen.getByRole('button', { name: 'Creating vote' });

        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(
            screen.queryByRole('button', { name: 'Create vote' }),
        ).toBeNull();
    });

    it('keeps a three-cell label grid in idle and loading states', () => {
        const { rerender } = render(
            <LoadingButton loading={false}>Create vote</LoadingButton>,
        );
        const idleGrid = screen
            .getByRole('button', { name: 'Create vote' })
            .querySelector('.grid');

        expect(idleGrid?.children).toHaveLength(3);

        rerender(
            <LoadingButton loading loadingLabel="Creating vote">
                Create vote
            </LoadingButton>,
        );

        const loadingGrid = screen
            .getByRole('button', { name: 'Creating vote' })
            .querySelector('.grid');

        expect(loadingGrid?.children).toHaveLength(3);
    });
});
