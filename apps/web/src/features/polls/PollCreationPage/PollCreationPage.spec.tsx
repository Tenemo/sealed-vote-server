import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

import PollCreation from './PollCreationPage';

const mockedCreatePoll = vi.fn();
const mockedGenerateClientToken = vi.fn();

vi.mock('features/polls/client-token', () => ({
    generateClientToken: () => mockedGenerateClientToken(),
}));

vi.mock('features/polls/polls-api', () => ({
    useCreatePollMutation: () => [
        mockedCreatePoll,
        { error: undefined, isLoading: false },
    ],
}));

const PollLocation = (): React.JSX.Element => {
    const { pollSlug } = useParams();
    return <div>{pollSlug}</div>;
};

describe('PollCreation', () => {
    beforeEach(() => {
        mockedCreatePoll.mockReset();
        mockedGenerateClientToken.mockReset();
        window.localStorage.clear();
    });

    it('navigates to the slug-based poll route after create', async () => {
        const user = userEvent.setup();

        mockedCreatePoll.mockReturnValue({
            unwrap: async () => ({
                id: '11111111-1111-4111-8111-111111111111',
                slug: 'best-fruit--1111',
                creatorToken: 'creator-token',
            }),
        });

        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route element={<PollCreation />} path="/" />
                        <Route
                            element={<PollLocation />}
                            path="/polls/:pollSlug"
                        />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>,
        );

        await user.type(
            screen.getByRole('textbox', { name: /^Poll name/i }),
            'Best fruit',
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice name/i }),
            'Apples',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice name/i }),
            'Bananas',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.click(screen.getByRole('button', { name: 'Create poll' }));

        await waitFor(() => {
            expect(screen.getByText('best-fruit--1111')).toBeInTheDocument();
        });
    });

    it('reuses the same creator token when create is retried without changing the form', async () => {
        const user = userEvent.setup();

        mockedGenerateClientToken.mockReturnValue('creator-token-1');
        mockedCreatePoll.mockReturnValue({
            unwrap: () => new Promise<void>(() => undefined),
        });

        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route element={<PollCreation />} path="/" />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>,
        );

        await user.type(
            screen.getByRole('textbox', { name: /^Poll name/i }),
            'Best fruit',
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice name/i }),
            'Apples',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice name/i }),
            'Bananas',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );

        await user.click(screen.getByRole('button', { name: 'Create poll' }));
        await user.click(screen.getByRole('button', { name: 'Create poll' }));

        expect(mockedGenerateClientToken).toHaveBeenCalledTimes(1);
        expect(mockedCreatePoll).toHaveBeenNthCalledWith(1, {
            choices: ['Apples', 'Bananas'],
            creatorToken: 'creator-token-1',
            pollName: 'Best fruit',
            protocolVersion: 'v1',
        });
        expect(mockedCreatePoll).toHaveBeenNthCalledWith(2, {
            choices: ['Apples', 'Bananas'],
            creatorToken: 'creator-token-1',
            pollName: 'Best fruit',
            protocolVersion: 'v1',
        });
    });

    it('explains that the threshold is derived automatically after close', () => {
        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route element={<PollCreation />} path="/" />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>,
        );

        expect(
            screen.getByText(
                /The app derives the honest-majority reconstruction threshold automatically from the final submitted roster after voting closes\./i,
            ),
        ).toBeInTheDocument();
    });

    it('renders create-page SEO metadata', () => {
        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/']}>
                    <Routes>
                        <Route element={<PollCreation />} path="/" />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>,
        );

        expect(document.title).toBe('Create a poll');
        expect(
            document.head
                .querySelector('meta[name="description"]')
                ?.getAttribute('content'),
        ).toBe('Create polls, collect responses, and reveal results.');
        expect(
            document.head
                .querySelector('meta[property="og:title"]')
                ?.getAttribute('content'),
        ).toBe('Create a poll');
    });
});
