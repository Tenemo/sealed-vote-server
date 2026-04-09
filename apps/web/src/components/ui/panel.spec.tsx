import { render } from '@testing-library/react';

import { Panel } from './panel';

describe('Panel', () => {
    it('applies the default radius through the radius variant', () => {
        const { container } = render(<Panel>Content</Panel>);
        const panel = container.firstElementChild;

        expect(panel).toHaveClass('rounded-[var(--radius-lg)]');
    });

    it('switches to the compact radius without keeping the default radius class', () => {
        const { container } = render(<Panel radius="compact">Content</Panel>);
        const panel = container.firstElementChild;

        expect(panel).toHaveClass('rounded-[var(--radius-md)]');
        expect(panel).not.toHaveClass('rounded-[var(--radius-lg)]');
    });
});
