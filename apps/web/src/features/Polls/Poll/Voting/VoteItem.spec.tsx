import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VoteItem from './VoteItem';

describe('VoteItem', () => {
    it('uses the choice name as the visible group legend', () => {
        render(
            <VoteItem
                choiceIndex={0}
                choiceName="Apples"
                onVote={vi.fn()}
                selectedScore={1}
            />,
        );

        expect(
            screen.getByText('Apples', { selector: 'legend' }),
        ).toBeVisible();
    });

    it('renders numeric scores from 1 to 10 as a radio group', () => {
        render(
            <VoteItem
                choiceIndex={0}
                choiceName="Apples"
                onVote={vi.fn()}
                selectedScore={1}
            />,
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
            <VoteItem
                choiceIndex={0}
                choiceName="Apples"
                onVote={onVote}
                selectedScore={1}
            />,
        );

        await user.click(
            screen.getByRole('radio', { name: 'Score 2 for Apples' }),
        );

        expect(onVote).toHaveBeenCalledWith('Apples', 2);
    });

    it('keeps the checked score keyboard reachable and lets arrow keys move the selection', async () => {
        const user = userEvent.setup();
        const onVote = vi.fn();

        render(
            <VoteItem
                choiceIndex={0}
                choiceName="Apples"
                onVote={onVote}
                selectedScore={1}
            />,
        );

        const firstRadio = screen.getByRole('radio', {
            name: 'Score 1 for Apples',
        });

        await user.tab();

        expect(firstRadio).toHaveFocus();

        await user.keyboard('{ArrowRight}');

        expect(onVote).toHaveBeenCalledWith('Apples', 2);
    });

    it('renders the selected score with an explicit white highlight', () => {
        render(
            <VoteItem
                choiceIndex={0}
                choiceName="Apples"
                onVote={vi.fn()}
                selectedScore={7}
            />,
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

    it('renders unselected scores with the shared solid surface instead of a transparent background', () => {
        render(
            <VoteItem
                choiceIndex={0}
                choiceName="Apples"
                onVote={vi.fn()}
                selectedScore={7}
            />,
        );

        const unselectedRadio = screen.getByRole('radio', {
            name: 'Score 6 for Apples',
        });
        const unselectedLabel = document.querySelector(
            `label[for="${unselectedRadio.getAttribute('id')}"]`,
        );

        expect(unselectedLabel).toHaveClass('bg-background');
        expect(unselectedLabel).not.toHaveClass('bg-transparent');
    });
});
