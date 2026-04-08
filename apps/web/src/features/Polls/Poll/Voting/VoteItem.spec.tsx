import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VoteItem from './VoteItem';

describe('VoteItem', () => {
    it('uses the choice name as the visible group legend', () => {
        render(
            <VoteItem choiceName="Apples" onVote={vi.fn()} selectedScore={1} />,
        );

        expect(
            screen.getByText('Apples', { selector: 'legend' }),
        ).toBeVisible();
    });

    it('renders numeric scores from 1 to 10 as a radio group', () => {
        render(
            <VoteItem choiceName="Apples" onVote={vi.fn()} selectedScore={1} />,
        );

        expect(
            screen.queryByRole('radio', { name: 'Abstain' }),
        ).not.toBeInTheDocument();

        for (let score = 1; score <= 10; score += 1) {
            expect(
                screen.getByRole('radio', {
                    name: `Score ${score} for Apples`,
                }),
            ).toBeInTheDocument();
        }
    });

    it('calls onVote with the selected numeric score', async () => {
        const user = userEvent.setup();
        const onVote = vi.fn();

        render(
            <VoteItem choiceName="Apples" onVote={onVote} selectedScore={1} />,
        );

        await user.click(
            screen.getByRole('radio', { name: 'Score 2 for Apples' }),
        );

        expect(onVote).toHaveBeenCalledWith('Apples', 2);
    });

    it('renders the selected score with an explicit white highlight', () => {
        render(
            <VoteItem choiceName="Apples" onVote={vi.fn()} selectedScore={7} />,
        );

        const selectedRadio = screen.getByRole('radio', {
            name: 'Score 7 for Apples',
        });
        const selectedLabel = document.querySelector(
            `label[for="${selectedRadio.getAttribute('id')}"]`,
        );

        expect(selectedLabel).toHaveClass('bg-white');
        expect(selectedLabel).toHaveClass('text-black');
    });
});
