import { render, screen } from '@testing-library/react';

import { Spinner } from './spinner';

describe('Spinner', () => {
    it('keeps the accessible label when aria-hidden is the string false', () => {
        render(<Spinner aria-hidden="false" label="Loading vote results" />);

        const spinner = screen.getByRole('status');

        expect(spinner).toHaveAttribute('aria-label', 'Loading vote results');
        expect(spinner).not.toHaveAttribute('aria-hidden', 'true');
    });

    it('hides the spinner when aria-hidden is the string true', () => {
        const { container } = render(
            <Spinner aria-hidden="true" label="Loading vote results" />,
        );

        expect(screen.queryByRole('status')).toBeNull();
        expect(container.firstElementChild).toHaveAttribute(
            'aria-hidden',
            'true',
        );
    });

    it('hides the spinner when the label is explicitly null', () => {
        const { container } = render(<Spinner label={null} />);

        expect(screen.queryByRole('status')).toBeNull();
        expect(container.firstElementChild).toHaveAttribute(
            'aria-hidden',
            'true',
        );
    });
});
