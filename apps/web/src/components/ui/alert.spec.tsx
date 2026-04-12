import { render, screen } from '@testing-library/react';

import { Alert, AlertDescription } from './alert';

describe('Alert', () => {
    it('maps polite announcements to status semantics', () => {
        render(
            <Alert announcement="polite">
                <AlertDescription>Retrying in the background.</AlertDescription>
            </Alert>,
        );

        const alert = screen.getByRole('status');

        expect(alert).toHaveAttribute('aria-atomic', 'true');
        expect(alert).toHaveAttribute('aria-live', 'polite');
        expect(alert).toHaveTextContent('Retrying in the background.');
    });

    it('keeps destructive alerts assertive by default', () => {
        render(
            <Alert variant="destructive">
                <AlertDescription>Vote submission failed.</AlertDescription>
            </Alert>,
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Vote submission failed.',
        );
    });
});
