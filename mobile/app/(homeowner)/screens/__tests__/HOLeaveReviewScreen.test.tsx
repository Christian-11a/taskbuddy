import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOLeaveReviewScreen from '../HOLeaveReviewScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getJob: jest.fn(),
    reviewJob: jest.fn(),
  },
}));

const JOB_ID = 'job-1';
const job = {
  id: JOB_ID,
  title: 'Check water heater',
  service_categories: { name: 'Plumbing' },
  assigned_provider: { full_name: 'TaskBuddyProvider' },
  has_review: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.getJob as jest.Mock).mockResolvedValue(job);
  (api.reviewJob as jest.Mock).mockResolvedValue({});
});

const renderScreen = (onSubmitted = jest.fn()) => {
  render(<HOLeaveReviewScreen jobId={JOB_ID} onSubmitted={onSubmitted} onBack={jest.fn()} />);
  return onSubmitted;
};
const submit = () => screen.getByRole('button', { name: 'Submit review' });
const star = (n: number) => screen.getByRole('radio', { name: `Rate ${n} out of 5 stars` });

describe('HOLeaveReviewScreen — rating, tags and the public notice', () => {
  it('shows the provider, the job, the tags, the comment box and that the review is public', async () => {
    renderScreen();

    expect(await screen.findByText('TaskBuddyProvider')).toBeTruthy();
    expect(screen.getByText('Plumbing: Check water heater')).toBeTruthy();
    for (const tag of ['On time', 'Friendly', 'Clean work', 'Fair price', 'Explained clearly']) {
      expect(screen.getByRole('button', { name: tag })).toBeTruthy();
    }
    expect(screen.getByLabelText('Add a comment (optional)')).toBeTruthy();
    expect(screen.getByText('Your review is public.')).toBeTruthy();
  });

  it('keeps Submit review disabled until a star is tapped, and then names the rating', async () => {
    renderScreen();
    await screen.findByText('TaskBuddyProvider');

    expect(screen.getByText('Tap a star to rate')).toBeTruthy();
    expect(submit().props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(star(4));

    expect(screen.getByText('Very good')).toBeTruthy();
    expect(submit().props.accessibilityState?.disabled).toBe(false);
  });

  it('gives each star a word from Poor to Excellent', async () => {
    renderScreen();
    await screen.findByText('TaskBuddyProvider');

    const words = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
    for (let n = 1; n <= 5; n += 1) {
      fireEvent.press(star(n));
      expect(screen.getByText(words[n - 1])).toBeTruthy();
    }
  });

  it('sends the rating with the tags first, in list order, then the comment', async () => {
    const onSubmitted = renderScreen();
    await screen.findByText('TaskBuddyProvider');

    fireEvent.press(star(4));
    fireEvent.press(screen.getByRole('button', { name: 'Friendly' }));
    fireEvent.press(screen.getByRole('button', { name: 'On time' }));
    fireEvent.changeText(screen.getByLabelText('Add a comment (optional)'), 'Fixed it fast');
    fireEvent.press(submit());

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(api.reviewJob).toHaveBeenCalledWith(JOB_ID, { rating: 4, comment: 'On time · Friendly · Fixed it fast' });
  });

  it('sends only the rating when no tag and no comment is given', async () => {
    const onSubmitted = renderScreen();
    await screen.findByText('TaskBuddyProvider');

    fireEvent.press(star(5));
    fireEvent.press(submit());

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(api.reviewJob).toHaveBeenCalledWith(JOB_ID, { rating: 5, comment: undefined });
  });

  it('does not send a second review for a job that already has one', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...job, has_review: true });
    renderScreen();

    expect(await screen.findByText('You already submitted a review for this job.')).toBeTruthy();
    fireEvent.press(star(5));

    expect(submit().props.accessibilityState?.disabled).toBe(true);
    expect(api.reviewJob).not.toHaveBeenCalled();
  });
});

it('every control has an accessible name: the five stars and the submit button', async () => {
  renderScreen();
  await waitFor(() => expect(star(1)).toBeTruthy());

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

describe('HOLeaveReviewScreen — a tag never deletes what was typed', () => {
  const comment = () => screen.getByLabelText('Add a comment (optional)');
  const tag = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

  beforeEach(async () => {
    renderScreen();
    await screen.findByText('TaskBuddyProvider');
    fireEvent.press(star(4));
  });

  it('keeps the typed comment as it is when a tag is picked and unpicked', () => {
    fireEvent.changeText(comment(), 'Fixed it fast');
    tag('On time');
    expect(screen.getByDisplayValue('Fixed it fast')).toBeTruthy();
    tag('On time');
    expect(screen.getByDisplayValue('Fixed it fast')).toBeTruthy();
  });

  it('never cuts a long comment when a tag is picked', () => {
    const long = 'x'.repeat(490);
    fireEvent.changeText(comment(), long);
    tag('Explained clearly');
    expect(screen.getByDisplayValue(long)).toBeTruthy();
    tag('Explained clearly');
    expect(screen.getByDisplayValue(long)).toBeTruthy();
  });

  it('counts the review as it will be sent, tags included', () => {
    expect(screen.getByText('0/500')).toBeTruthy();
    tag('On time');
    expect(screen.getByText('7/500')).toBeTruthy();
    fireEvent.changeText(comment(), 'Fixed it fast');
    expect(screen.getByText('23/500')).toBeTruthy();
  });

  it('when the tag does not fit, says how much to cut and keeps Submit review disabled until it fits', () => {
    fireEvent.changeText(comment(), 'x'.repeat(490));
    tag('Explained clearly');

    expect(screen.getByText('Shorten your review by 10 characters.')).toBeTruthy();
    expect(submit().props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(submit());
    expect(api.reviewJob).not.toHaveBeenCalled();

    tag('Explained clearly');
    expect(screen.queryByText('Shorten your review by 10 characters.')).toBeNull();
    expect(submit().props.accessibilityState?.disabled).toBe(false);
  });

  it('shortening the comment clears the helper and sends the tag with the shorter comment', async () => {
    fireEvent.changeText(comment(), 'x'.repeat(490));
    tag('Explained clearly');
    fireEvent.changeText(comment(), 'x'.repeat(480));

    expect(screen.queryByText(/Shorten your review/)).toBeNull();
    fireEvent.press(submit());

    await waitFor(() => expect(api.reviewJob).toHaveBeenCalledTimes(1));
    expect(api.reviewJob).toHaveBeenCalledWith(JOB_ID, { rating: 4, comment: `Explained clearly · ${'x'.repeat(480)}` });
  });

  it('a tag picked and then unpicked with no comment still sends no comment', async () => {
    tag('On time');
    tag('On time');
    fireEvent.press(submit());

    await waitFor(() => expect(api.reviewJob).toHaveBeenCalledTimes(1));
    expect(api.reviewJob).toHaveBeenCalledWith(JOB_ID, { rating: 4, comment: undefined });
  });
});

it('sends the rating with no comment when the comment is only spaces, and the comment without its ends otherwise', async () => {
  const onSubmitted = renderScreen();
  await screen.findByText('TaskBuddyProvider');
  fireEvent.press(star(3));
  fireEvent.changeText(screen.getByLabelText('Add a comment (optional)'), '   \n\n  ');
  fireEvent.press(submit());

  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  expect(api.reviewJob).toHaveBeenCalledWith(JOB_ID, { rating: 3, comment: undefined });
});

it('trims the comment it sends when no tag is chosen', async () => {
  const onSubmitted = renderScreen();
  await screen.findByText('TaskBuddyProvider');
  fireEvent.press(star(4));
  fireEvent.changeText(screen.getByLabelText('Add a comment (optional)'), '  Fixed it fast  ');
  fireEvent.press(submit());

  await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  expect(api.reviewJob).toHaveBeenCalledWith(JOB_ID, { rating: 4, comment: 'Fixed it fast' });
});
