import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route element={<PollCreation />} path="/" />
                    <Route element={<PollLocation />} path="/votes/:pollSlug" />
                </Routes>
            </MemoryRouter>,
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
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route element={<PollCreation />} path="/" />
                </Routes>
            </MemoryRouter>,
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
            pollName: 'Best fruit',
        });
        expect(mockedCreatePoll).toHaveBeenNthCalledWith(2, {
            choices: ['Apples', 'Bananas'],
            creatorToken: 'creator-token-1',
            pollName: 'Best fruit',
        });
    });
});
