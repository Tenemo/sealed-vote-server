import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

import PollCreation from './PollCreation';

const mockedCreatePoll = vi.fn();
const mockedGenerateClientToken = vi.fn();

vi.mock('features/Polls/clientToken', () => ({
    generateClientToken: () => mockedGenerateClientToken(),
}));

vi.mock('features/Polls/pollsApi', () => ({
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

    it('navigates to the slug-based vote route after create', async () => {
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
                            path="/votes/:pollSlug"
                        />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>,
        );

        await user.type(
            screen.getByRole('textbox', { name: /^Vote name/i }),
            'Best fruit',
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice to vote for/i }),
            'Apples',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice to vote for/i }),
            'Bananas',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.click(screen.getByRole('button', { name: 'Create vote' }));

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
            screen.getByRole('textbox', { name: /^Vote name/i }),
            'Best fruit',
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice to vote for/i }),
            'Apples',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice to vote for/i }),
            'Bananas',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );

        await user.click(screen.getByRole('button', { name: 'Create vote' }));
        await user.click(screen.getByRole('button', { name: 'Create vote' }));

        expect(mockedGenerateClientToken).toHaveBeenCalledTimes(1);
        expect(mockedCreatePoll).toHaveBeenNthCalledWith(1, {
            choices: ['Apples', 'Bananas'],
            creatorToken: 'creator-token-1',
            minimumPublishedVoterCount: 3,
            pollName: 'Best fruit',
            protocolVersion: 'v1',
            reconstructionThreshold: 2,
        });
        expect(mockedCreatePoll).toHaveBeenNthCalledWith(2, {
            choices: ['Apples', 'Bananas'],
            creatorToken: 'creator-token-1',
            minimumPublishedVoterCount: 3,
            pollName: 'Best fruit',
            protocolVersion: 'v1',
            reconstructionThreshold: 2,
        });
    });

    it('shows threshold defaults as placeholders while keeping the inputs empty', async () => {
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
            screen.getByRole('spinbutton', {
                name: /^Reconstruction threshold/i,
            }),
        ).toHaveValue(null);
        expect(
            screen.getByRole('spinbutton', {
                name: /^Minimum published voter count/i,
            }),
        ).toHaveValue(null);
        expect(
            screen.getByRole('spinbutton', {
                name: /^Reconstruction threshold/i,
            }),
        ).toHaveAttribute('placeholder', '2');
        expect(
            screen.getByRole('spinbutton', {
                name: /^Minimum published voter count/i,
            }),
        ).toHaveAttribute('placeholder', '3');
    });

    it('submits explicit threshold values once the fields are edited', async () => {
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
            screen.getByRole('textbox', { name: /^Vote name/i }),
            'Best fruit',
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice to vote for/i }),
            'Apples',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );
        await user.type(
            screen.getByRole('textbox', { name: /^Choice to vote for/i }),
            'Bananas',
        );
        await user.click(
            screen.getByRole('button', { name: 'Add new choice' }),
        );

        await user.clear(
            screen.getByRole('spinbutton', {
                name: /^Reconstruction threshold/i,
            }),
        );
        await user.type(
            screen.getByRole('spinbutton', {
                name: /^Reconstruction threshold/i,
            }),
            '4',
        );
        await user.clear(
            screen.getByRole('spinbutton', {
                name: /^Minimum published voter count/i,
            }),
        );
        await user.type(
            screen.getByRole('spinbutton', {
                name: /^Minimum published voter count/i,
            }),
            '6',
        );

        await user.click(screen.getByRole('button', { name: 'Create vote' }));

        expect(mockedCreatePoll).toHaveBeenCalledWith({
            choices: ['Apples', 'Bananas'],
            creatorToken: 'creator-token-1',
            minimumPublishedVoterCount: 6,
            pollName: 'Best fruit',
            protocolVersion: 'v1',
            reconstructionThreshold: 4,
        });
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

        expect(document.title).toBe('Create a vote');
        expect(
            document.head
                .querySelector('meta[name="description"]')
                ?.getAttribute('content'),
        ).toBe('Create votes, collect responses, and reveal results.');
        expect(
            document.head
                .querySelector('meta[property="og:title"]')
                ?.getAttribute('content'),
        ).toBe('Create a vote');
    });
});
