import { render, screen } from '@testing-library/react';

import LoadingButton from './LoadingButton';

describe('LoadingButton', () => {
    it('uses the loading label and disables the button while work is pending', () => {
        render(
            <LoadingButton loading loadingLabel="Creating poll">
                Create poll
            </LoadingButton>,
        );

        const button = screen.getByRole('button', { name: 'Creating poll' });

        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(
            screen.queryByRole('button', { name: 'Create poll' }),
        ).toBeNull();
    });
});
