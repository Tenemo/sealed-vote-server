import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ChoiceAdding from './PollChoiceEditor';

describe('ChoiceAdding', () => {
    it('does not add a duplicate choice through the keyboard path', async () => {
        const user = userEvent.setup();
        const onAddChoice = vi.fn();

        render(
            <ChoiceAdding
                choices={['Apples']}
                onAddChoice={onAddChoice}
                onRemoveChoice={vi.fn()}
            />,
        );

        await user.type(
            screen.getByRole('textbox', { name: /^Choice name/i }),
            'Apples{Enter}',
        );

        expect(onAddChoice).not.toHaveBeenCalled();
        expect(
            screen.getByText('This choice already exists'),
        ).toBeInTheDocument();
    });

    it('adds a valid choice through the keyboard path', async () => {
        const user = userEvent.setup();
        const onAddChoice = vi.fn();

        render(
            <ChoiceAdding
                choices={['Apples']}
                onAddChoice={onAddChoice}
                onRemoveChoice={vi.fn()}
            />,
        );

        await user.type(
            screen.getByRole('textbox', { name: /^Choice name/i }),
            'Bananas{Enter}',
        );

        expect(onAddChoice).toHaveBeenCalledWith('Bananas');
    });
});
