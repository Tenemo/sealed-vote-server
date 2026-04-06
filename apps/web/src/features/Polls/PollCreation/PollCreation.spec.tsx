import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

import PollCreation from './PollCreation';

const mockedCreatePoll = vi.fn();

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
    });

    it('navigates to the slug-based vote route after create', async () => {
        const user = userEvent.setup();

        mockedCreatePoll.mockReturnValue({
            unwrap: async () => ({
                id: '11111111-1111-4111-8111-111111111111',
                slug: 'best-fruit--11111111',
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
            expect(
                screen.getByText('best-fruit--11111111'),
            ).toBeInTheDocument();
        });
    });
});
