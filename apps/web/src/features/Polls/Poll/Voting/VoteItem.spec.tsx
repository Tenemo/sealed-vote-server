import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VoteItem from './VoteItem';

describe('VoteItem', () => {
  it('renders numeric scores from 1 to 10 without the abstain label', () => {
    render(<VoteItem choiceName="Apples" onVote={vi.fn()} selectedScore={1} />);

    expect(
      screen.queryByRole('button', { name: 'Abstain' }),
    ).not.toBeInTheDocument();

    for (let score = 1; score <= 10; score += 1) {
      expect(
        screen.getByRole('button', { name: String(score) }),
      ).toBeInTheDocument();
    }
  });

  it('calls onVote with the selected numeric score', async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();

    render(<VoteItem choiceName="Apples" onVote={onVote} selectedScore={1} />);

    await user.click(screen.getByRole('button', { name: '1' }));

    expect(onVote).toHaveBeenCalledWith('Apples', 1);
  });
});
