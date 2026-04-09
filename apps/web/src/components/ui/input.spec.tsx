import { render, screen } from '@testing-library/react';

import { Input } from './input';

describe('Input', () => {
    it('uses the outlined variant by default', () => {
        render(<Input aria-label="Vote name" />);

        expect(screen.getByLabelText('Vote name')).toHaveClass(
            'border-input',
            'bg-background',
        );
    });

    it('renders the filled variant for embedded share fields', () => {
        render(<Input aria-label="Share vote link" variant="filled" />);

        expect(screen.getByLabelText('Share vote link')).toHaveClass(
            'bg-filled',
            'hover:bg-filled-hover',
        );
    });
});
