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
});
