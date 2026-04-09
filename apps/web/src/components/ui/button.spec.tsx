import { render, screen } from '@testing-library/react';

import { Button } from './button';

describe('Button', () => {
    it('resets native button appearance so custom styles apply cross-browser', () => {
        render(<Button>Begin vote</Button>);

        expect(screen.getByRole('button', { name: 'Begin vote' })).toHaveClass(
            'appearance-none',
        );
    });

    it('defaults to the button type for native buttons', () => {
        render(<Button>Begin vote</Button>);

        expect(
            screen.getByRole('button', { name: 'Begin vote' }),
        ).toHaveAttribute('type', 'button');
    });
});
