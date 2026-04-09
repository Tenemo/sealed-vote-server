import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

describe('App', () => {
    afterEach(() => {
        vi.doUnmock('components/Header/Header');
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('renders the crash fallback when the header fails to render', async () => {
        vi.doMock('components/Header/Header', () => ({
            default: (): React.JSX.Element => {
                throw new Error('header render failed');
            },
        }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { default: App } = await import('./App');

        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>,
        );

        expect(
            screen.getByRole('heading', {
                name: 'The application has crashed due to a rendering error.',
            }),
        ).toBeInTheDocument();
    });
});
