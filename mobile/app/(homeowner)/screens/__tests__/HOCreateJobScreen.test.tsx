import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { BackHandler, ScrollView, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { BrushCleaning, Footprints, Hammer, Wrench } from 'lucide-react-native';
import HOCreateJobScreen from '../HOCreateJobScreen';
import ServiceTile from '../../../../src/components/post/ServiceTile';
import NailPolishIcon from '../../../../src/components/ui/icons/NailPolishIcon';
import { api, ApiError } from '../../../../src/lib/api';
import { showToast } from '../../../../src/components/Toast';
import { isBackBlockedByScreen } from '../../../../src/hooks/useLeaveGuard';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  },
  api: {
    categories: jest.fn(), createJob: jest.fn(), uploadImage: jest.fn(),
    estimatePrice: jest.fn(), geocodeAddress: jest.fn(),
  },
}));
const PRICE_OPTIONS = [
  { tier: 'basic', amount: 1250, min: 1150, max: 1400 },
  { tier: 'standard', amount: 1500, min: 1350, max: 1650 },
  { tier: 'premium', amount: 1900, min: 1700, max: 2100 },
];
beforeEach(() => {
  (api.estimatePrice as jest.Mock).mockResolvedValue({ options: PRICE_OPTIONS });
});
jest.mock('../../../../src/components/Toast', () => ({ showToast: jest.fn() }));
const DEFAULT_PROFILE = { address: 'Quezon City', latitude: 14.6, longitude: 121 };
let mockProfile: { address: string | null; latitude: number | null; longitude: number | null } = { ...DEFAULT_PROFILE };
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => ({ profile: mockProfile }) }));
beforeEach(() => { mockProfile = { ...DEFAULT_PROFILE }; });
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-calendars', () => ({ Calendar: ({ onDayPress }: any) => {
  const { Text } = jest.requireActual('react-native');
  return <Text onPress={() => onDayPress({ dateString: '2030-12-10' })}>Choose test date</Text>;
} }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: ({onChange}: any) => {
  const { Text } = jest.requireActual('react-native');
  return <Text onPress={() => onChange({type: 'set'}, new Date('2030-12-10T09:00:00'))}>Choose test time</Text>;
} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

it('keeps the urgency step visible and reports missing required fields when Next is pressed', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  fireEvent.press(screen.getByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Pick a date');
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));
  await waitFor(() => expect(screen.getAllByText('Please select a preferred date.').length).toBeGreaterThan(0));
  // The price comes from the urgency, so there is nothing to pick and no price error.
  expect(screen.queryByText('Please pick a price for this job.')).toBeNull();
  expect(screen.queryByTestId('create-job-review')).toBeNull();
});

it('posts from review without another terms acceptance and retains form state after photo preview', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock).mockResolvedValue({ id: 'new-job' });
  (api.uploadImage as jest.Mock).mockResolvedValue('client/photo.jpg');
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({canceled: false, assets: [{uri: 'file:///portrait'}, {uri: 'file:///landscape'}]});
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  await act(async () => fireEvent.press(screen.getByText('Add photos (optional)')));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByLabelText('Open selected photo 2'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe('file:///landscape');
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.getByTestId('create-job-review')).toBeTruthy();
  expect(screen.queryByText(/I agree to the/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Post job')));
  expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({price_tier: 'standard', tasks: ['Fix leaking faucet'], task_efforts: ['moderate']}));
  expect(await screen.findByText('Post another job')).toBeTruthy();
});

it('opens a job-limit dialog with the server message when posting answers 409', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock).mockRejectedValue(
    Object.assign(new Error('You have 3 active jobs. Finish one to create another.'), { status: 409 }),
  );
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));
  await act(async () => fireEvent.press(await screen.findByText('Post job')));
  expect(await screen.findByText('Job limit reached')).toBeTruthy();
  expect(screen.getByText('You have 3 active jobs. Finish one to create another.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(screen.queryByText('Job limit reached')).toBeNull());
});

const NO_TASKS_MESSAGE = 'Pick at least one task so providers know what the job involves.';

it('shows an error only after Next, once, under the field that is wrong', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  expect(screen.queryByText(NO_TASKS_MESSAGE)).toBeNull();

  fireEvent.press(screen.getByText('Next'));
  expect(await screen.findByText(NO_TASKS_MESSAGE)).toBeTruthy();
  expect(screen.getAllByText(NO_TASKS_MESSAGE)).toHaveLength(1);
});

it('clears an error as soon as its field is fixed, and keeps it while the edit is still wrong', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  fireEvent.press(screen.getByText('Next'));

  const tooShort = 'Description must be at least 20 characters.';
  const description = screen.getByPlaceholderText('Describe the job in detail...');
  expect(await screen.findByText(tooShort)).toBeTruthy();

  fireEvent.changeText(description, 'Short one');
  expect(screen.getByText(tooShort)).toBeTruthy();

  fireEvent.changeText(description, 'A leaking kitchen faucet that needs replacing.');
  expect(screen.queryByText(tooShort)).toBeNull();
});

it('clears the price error once prices load after a failure, and leaves other errors alone', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.estimatePrice as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Pick a date');
  await screen.findByRole('button', { name: 'Try loading prices again' });
  fireEvent.press(screen.getByText('Next'));

  const budgetMessage = 'Please pick a price for this job.';
  expect(await screen.findByText(budgetMessage)).toBeTruthy();
  (api.estimatePrice as jest.Mock).mockResolvedValue({ options: PRICE_OPTIONS });
  fireEvent.press(screen.getByRole('button', { name: 'Try loading prices again' }));
  await screen.findByTestId('price-option-standard');
  expect(screen.queryByText(budgetMessage)).toBeNull();
  expect(screen.getByText('Please select a preferred date.')).toBeTruthy();
});

it('the review lists everything entered, and each Edit link goes back to its step', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));

  const review = await screen.findByTestId('create-job-review');
  expect(within(review).getByText('Plumbing: Fix leaking faucet')).toBeTruthy();
  expect(within(review).getByText('Fix leaking faucet')).toBeTruthy();
  expect(within(review).getByText('Plumbing service needed. Tasks: Fix leaking faucet.')).toBeTruthy();
  expect(within(review).getAllByRole('button', { name: /^Edit / })).toHaveLength(7);
  expect(screen.getByText('You only pay when you hire. You can cancel for free until then.')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Edit Description' }));
  expect(await screen.findByText('What needs doing?')).toBeTruthy();
});

async function postTheJob() {
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));
  await act(async () => fireEvent.press(screen.getByText('Post job')));
}

it('the job posted screen names the real service and offers View my jobs', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock).mockResolvedValue({ id: 'new-job' });
  const onSuccess = jest.fn();
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={onSuccess} />);
  await screen.findByText('Location confirmed');
  await postTheJob();

  expect(await screen.findByText('Job posted!')).toBeTruthy();
  expect(screen.getByText(
    "Nearby Plumbing providers can now send you proposals. We'll notify you when the first one arrives.",
  )).toBeTruthy();
  expect(screen.getByText('Compare proposals on the job page')).toBeTruthy();
  expect(screen.getByText('Hire one; your money is held safely')).toBeTruthy();
  expect(screen.getByText('Pay only when the work is done')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'View my jobs' }));
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

it('Post another job starts a blank form at the first step', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock).mockResolvedValue({ id: 'new-job' });
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  await postTheJob();

  fireEvent.press(await screen.findByRole('button', { name: 'Post another job' }));
  expect(await screen.findByText('What do you need help with?')).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'Plumbing', checked: true })).toBeNull();
});

it('says the location is off while the address has no coordinates', async () => {
  mockProfile = { address: null, latitude: null, longitude: null };
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  expect(await screen.findByText("Location is off, so we couldn't find you. Typing the address works just as well.")).toBeTruthy();
});

it('explains the written title once, under the job title and not under the description', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  expect(screen.getAllByText('Written for you from the tasks; edit if you like')).toHaveLength(1);
  expect(screen.getByText('0/750')).toBeTruthy();
});
it('while posting shows only the steps that really run, and a failed post returns to Review', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.uploadImage as jest.Mock).mockResolvedValue('client/photo.jpg');
  let rejectPost: (error: Error) => void = () => {};
  (api.createJob as jest.Mock).mockImplementation(
    () => new Promise((_resolve, reject) => { rejectPost = reject; }),
  );
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///one' }] });
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  await act(async () => fireEvent.press(screen.getByText('Add photos (optional)')));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));
  await act(async () => fireEvent.press(screen.getByText('Post job')));

  expect(await screen.findByText('Posting your job...')).toBeTruthy();
  expect(screen.getByLabelText('Uploading photos: done')).toBeTruthy();
  expect(screen.getByLabelText('Posting your job: in progress', { exact: false })).toBeTruthy();
  expect(screen.queryByText('Post job')).toBeNull();

  await act(async () => rejectPost(new Error('Network is down')));
  expect(await screen.findByText('Network is down')).toBeTruthy();
  expect(screen.getByTestId('create-job-review')).toBeTruthy();
  expect(screen.getByText('Post job')).toBeTruthy();
});

/** Fills in the job the way the posting tests do, and stops on the review, before Post job is pressed. */
async function reachReview() {
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  await screen.findByTestId('price-option-standard');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByTestId('create-job-review');
}

it('two quick taps on Post job post the job once, and the second says why it was ignored', async () => {
  jest.clearAllMocks();
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  let finishPost: (value: unknown) => void = () => {};
  (api.createJob as jest.Mock).mockReturnValue(new Promise((resolve) => { finishPost = resolve; }));
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  await reachReview();

  const post = screen.getByText('Post job');
  await act(async () => {
    fireEvent.press(post);
    fireEvent.press(post);
  });

  expect(api.createJob).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith("We're already posting your job. Please wait.", 'info');

  await act(async () => finishPost({ id: 'new-job' }));
  expect(await screen.findByText('Job posted!')).toBeTruthy();
  expect(api.createJob).toHaveBeenCalledTimes(1);
});

it('a post that failed can be tried again, without any notice about a repeated tap', async () => {
  jest.clearAllMocks();
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock)
    .mockRejectedValueOnce(new Error('Network is down'))
    .mockResolvedValueOnce({ id: 'new-job' });
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  await reachReview();

  await act(async () => fireEvent.press(screen.getByText('Post job')));
  expect(await screen.findByText('Network is down')).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByText('Post job')));
  expect(await screen.findByText('Job posted!')).toBeTruthy();
  expect(api.createJob).toHaveBeenCalledTimes(2);
  expect(showToast).not.toHaveBeenCalled();
});

describe('HOCreateJobScreen — posting cannot place the address', () => {
  const ADDRESS_MESSAGE = "We couldn't match that address exactly. Check the house number, street and city.";

  /** Fills the job in, presses Post job, and lets createJob fail once with `err`. */
  const postAndFailWith = async (err: Error) => {
    jest.clearAllMocks();
    (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
    (api.createJob as jest.Mock).mockRejectedValueOnce(err);
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    await reachReview();
    await act(async () => fireEvent.press(screen.getByText('Post job')));
  };

  it('a 400 about the address sends the client back to Where, with the message under the field', async () => {
    await postAndFailWith(new ApiError(ADDRESS_MESSAGE, 400));

    expect(await screen.findByText('Where is the job?')).toBeTruthy();
    expect(screen.queryByTestId('create-job-review')).toBeNull();
    // Once, under the field: no banner repeats it.
    expect(screen.getAllByText(/We couldn't match that address exactly/)).toHaveLength(1);
    expect(screen.getByText(/Pick a suggestion from the list, or edit the address\./)).toBeTruthy();
    expect(screen.queryByText('Location confirmed')).toBeNull();
    // The address the client had is kept for them to fix.
    expect(screen.getByDisplayValue('Quezon City')).toBeTruthy();
    expect(api.createJob).toHaveBeenCalledTimes(1);
  });

  it('the message goes away as soon as the client edits the address', async () => {
    await postAndFailWith(new ApiError(ADDRESS_MESSAGE, 400));
    await screen.findByText('Where is the job?');
    expect(screen.getAllByText(/We couldn't match that address exactly/)).toHaveLength(1);

    fireEvent.changeText(screen.getByTestId('create-job-address'), 'Quezon City Hall, Elliptical Road');

    await waitFor(() => expect(screen.queryByText(/We couldn't match that address exactly/)).toBeNull());
  });

  it('after the bounce, Next checks the address again and moves on once it is placed', async () => {
    await postAndFailWith(new ApiError(ADDRESS_MESSAGE, 400));
    await screen.findByText('Where is the job?');
    (api.geocodeAddress as jest.Mock).mockResolvedValueOnce({ latitude: 14.61, longitude: 121.01 });

    await act(async () => fireEvent.press(screen.getByText('Next')));

    expect(api.geocodeAddress).toHaveBeenCalledWith('Quezon City');
    expect(await screen.findByText('Fix leaking faucet')).toBeTruthy();
    expect(screen.queryByText(/We couldn't match that address exactly/)).toBeNull();
  });

  it.each([
    ['a 400 about another field', new ApiError('title must be longer than or equal to 5 characters', 400)],
    ['a 503 that mentions the address', new ApiError('Address lookup is not configured', 503)],
    ['a plain error with the address text', new Error(ADDRESS_MESSAGE)],
  ])('%s keeps the client on Review with the message', async (_label, err) => {
    await postAndFailWith(err);

    expect(await screen.findByText(err.message)).toBeTruthy();
    expect(screen.getByTestId('create-job-review')).toBeTruthy();
    expect(screen.queryByText('Where is the job?')).toBeNull();
  });
});

/** Like reachReview, but picks an urgency first and waits for that urgency's one price. */
async function reachReviewAt(urgency: 'Flexible' | 'Normal' | 'Urgent', tier: 'basic' | 'standard' | 'premium') {
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  fireEvent.press(screen.getByText(urgency));
  await screen.findByTestId(`price-option-${tier}`);
  fireEvent.press(screen.getByText('Next'));
  await screen.findByTestId('create-job-review');
}

it.each([
  ['Urgent', 'premium'],
  ['Flexible', 'basic'],
] as const)('a %s job is posted at the %s price, with no tier to pick', async (urgency, tier) => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock).mockClear().mockResolvedValue({ id: 'new-job' });
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  await reachReviewAt(urgency, tier);

  expect(api.estimatePrice).toHaveBeenLastCalledWith({
    category_id: 1, urgency: urgency.toLowerCase(), task_efforts: ['moderate'],
  });
  await act(async () => fireEvent.press(screen.getByText('Post job')));
  expect(api.createJob).toHaveBeenCalledWith(
    expect.objectContaining({ urgency: urgency.toLowerCase(), price_tier: tier }),
  );
});

it('every control has an accessible name on the first step: back, the service and the location', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

it('the Manicure tile shows the nail polish icon, and the other service tiles keep theirs', async () => {
  (api.categories as jest.Mock).mockResolvedValue([
    { id: 1, name: 'Plumbing' }, { id: 2, name: 'Cleaning' }, { id: 3, name: 'Handyman' },
    { id: 4, name: 'Manicure' }, { id: 5, name: 'Pedicure' },
  ]);
  render(<HOCreateJobScreen onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByRole('radio', { name: 'Manicure' });

  const iconFor = (name: string) => screen.UNSAFE_getAllByType(ServiceTile).find((tile) => tile.props.name === name)?.props.icon;
  expect(iconFor('Manicure')).toBe(NailPolishIcon);
  expect(iconFor('Plumbing')).toBe(Wrench);
  expect(iconFor('Cleaning')).toBe(BrushCleaning);
  expect(iconFor('Handyman')).toBe(Hammer);
  expect(iconFor('Pedicure')).toBe(Footprints);
});

describe('HOCreateJobScreen — fields are checked against the backend limits', () => {
  beforeEach(() => {
    (api.createJob as jest.Mock).mockClear();
  });

  /** Opens the job on its tasks step, with Plumbing chosen and the saved address in place. */
  const openTasksStep = async () => {
    (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fix leaking faucet');
  };
  const addOwnTask = (text: string) => {
    const input = screen.getByLabelText('Add your own task');
    fireEvent.changeText(input, text);
    fireEvent(input, 'submitEditing');
  };
  const openBudgetStep = async () => {
    await openTasksStep();
    fireEvent.press(screen.getByText('Fix leaking faucet'));
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Pick a date');
  };

  it('offers Try again when prices fail to load, and loads them on retry', async () => {
    (api.estimatePrice as jest.Mock).mockRejectedValue(new Error('Not found'));
    await openBudgetStep();

    expect(await screen.findByText("Couldn't reach TaskBuddy. Check your connection and try again.")).toBeTruthy();
    const callsBefore = (api.estimatePrice as jest.Mock).mock.calls.length;
    (api.estimatePrice as jest.Mock).mockResolvedValue({ options: PRICE_OPTIONS });
    fireEvent.press(screen.getByRole('button', { name: 'Try loading prices again' }));

    expect(await screen.findByTestId('price-option-standard')).toBeTruthy();
    expect((api.estimatePrice as jest.Mock).mock.calls.length).toBe(callsBefore + 1);
  });

  it('shows the estimated prices instead of a budget field', async () => {
    await openBudgetStep();
    expect(await screen.findByText('₱1,500.00')).toBeTruthy();
    expect(api.estimatePrice).toHaveBeenLastCalledWith({
      category_id: 1, urgency: 'normal', task_efforts: ['moderate'],
    });
    expect(screen.queryByPlaceholderText('0.00')).toBeNull();
  });

  it('shows one price, the tier its urgency stands for: Normal is Standard, already chosen', async () => {
    await openBudgetStep();
    const row = await screen.findByTestId('price-option-standard');
    expect(row.props.accessibilityState?.selected).toBe(true);
    expect(screen.queryByTestId('price-option-basic')).toBeNull();
    expect(screen.queryByTestId('price-option-premium')).toBeNull();
  });

  it('says prices are unavailable when the estimate has no price for the urgency, and Try again loads it', async () => {
    const unavailable = "Prices aren't available right now. Please try again in a moment.";
    (api.estimatePrice as jest.Mock).mockResolvedValue({
      options: PRICE_OPTIONS.filter((option) => option.tier !== 'standard'),
    });
    await openBudgetStep();

    expect(await screen.findByText(unavailable)).toBeTruthy();
    expect(screen.queryByTestId('price-option-basic')).toBeNull();
    expect(screen.queryByTestId('price-option-premium')).toBeNull();

    (api.estimatePrice as jest.Mock).mockResolvedValue({ options: PRICE_OPTIONS });
    fireEvent.press(screen.getByRole('button', { name: 'Try loading prices again' }));
    expect(await screen.findByTestId('price-option-standard')).toBeTruthy();
    expect(screen.queryByText(unavailable)).toBeNull();
  });

  it('changing urgency drops the old price, waits for the new one, and ignores an answer that arrives late', async () => {
    await openBudgetStep();
    fireEvent.press(screen.getByText('Pick a date'));
    fireEvent.press(screen.getByText('Choose test date'));
    fireEvent.press(screen.getByText('Pick a time'));
    fireEvent.press(screen.getByText('Choose test time'));
    if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
    expect((await screen.findByTestId('price-option-standard')).props.accessibilityState?.selected).toBe(true);

    let resolveUrgent!: (value: { options: typeof PRICE_OPTIONS }) => void;
    let resolveFlexible!: (value: { options: typeof PRICE_OPTIONS }) => void;
    (api.estimatePrice as jest.Mock)
      .mockReturnValueOnce(new Promise((resolve) => { resolveUrgent = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveFlexible = resolve; }));
    fireEvent.press(screen.getByText('Urgent'));

    // The old price is gone while the new estimate loads, and Next waits for it.
    expect(screen.queryByTestId('price-option-standard')).toBeNull();
    expect(screen.queryByText('₱1,500.00')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    // Flexible answers first; the Urgent answer that lands afterwards is stale and ignored.
    fireEvent.press(screen.getByText('Flexible'));
    await act(async () => resolveFlexible({ options: PRICE_OPTIONS }));
    await act(async () => resolveUrgent({ options: PRICE_OPTIONS }));

    expect(screen.getByTestId('price-option-basic').props.accessibilityState?.selected).toBe(true);
    expect(screen.queryByTestId('price-option-premium')).toBeNull();
    expect(screen.queryByTestId('price-option-standard')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByTestId('create-job-review')).toBeTruthy();
  });

  it('refuses an address shorter than 5 characters, before it is checked with the geocoder', async () => {
    (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.changeText(screen.getByTestId('create-job-address'), 'Qc');

    fireEvent.press(screen.getByText('Next'));

    expect(await screen.findByText('Add a few more words (at least 5 characters)')).toBeTruthy();
    expect(screen.queryByText('Pick a date')).toBeNull();
  });

  it('stops the job address at 300 characters, the most the geocoder is asked to take', async () => {
    (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');

    expect(screen.getByTestId('create-job-address').props.maxLength).toBe(300);
  });

  it('allows up to 20 tasks and says so when a 21st is typed', async () => {
    await openTasksStep();
    for (let i = 1; i <= 20; i++) addOwnTask(`Own task ${i}`);
    expect(screen.getByText('20/20 tasks selected')).toBeTruthy();

    addOwnTask('One too many');

    expect(screen.getByText('You can add up to 20 tasks.')).toBeTruthy();
    expect(screen.getByText('20/20 tasks selected')).toBeTruthy();
    expect(screen.getByLabelText('Add your own task').props.value).toBe('One too many');
  });

  it('says a task already on the list is not added twice', async () => {
    await openTasksStep();
    addOwnTask('Mop the floor');
    addOwnTask('Mop the floor');

    expect(screen.getByText('That task is already on your list.')).toBeTruthy();
    expect(screen.getAllByText('Mop the floor')).toHaveLength(1);
  });

  it('keeps a drafted title within 120 characters when a long task starts it', async () => {
    await openTasksStep();
    addOwnTask('x'.repeat(120));

    expect(screen.getByLabelText('Job title').props.value.length).toBeLessThanOrEqual(120);
    expect(screen.getByLabelText('Job title').props.maxLength).toBe(120);
  });

  it('caps the description at 750 characters and shows the limit', async () => {
    await openTasksStep();

    expect(screen.getByPlaceholderText('Describe the job in detail...').props.maxLength).toBe(750);
    expect(screen.getByText('0/750')).toBeTruthy();
  });
});

describe('HOCreateJobScreen — back and exit', () => {
  beforeEach(() => {
    (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Android back as the system delivers it: the newest listener is asked first, until one takes the press. */
  function pressHardwareBack(addListener: jest.SpyInstance) {
    const handlers = addListener.mock.calls
      .filter(([eventName]) => eventName === 'hardwareBackPress')
      .map(([, handler]) => handler as () => boolean | null | undefined);
    for (const handler of [...handlers].reverse()) {
      if (handler()) return;
    }
  }

  /** From a fresh form, through every step to the review, with one task, a date, a time and a budget. */
  const fillInJobToReview = async () => {
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(await screen.findByText('Fix leaking faucet'));
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(await screen.findByText('Pick a date'));
    fireEvent.press(screen.getByText('Choose test date'));
    fireEvent.press(screen.getByText('Pick a time'));
    fireEvent.press(screen.getByText('Choose test time'));
    if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
    fireEvent.press(await screen.findByTestId('price-option-standard'));
    fireEvent.press(screen.getByText('Next'));
    await screen.findByTestId('create-job-review');
  };

  it('hardware back on the budget step goes to the tasks step and does not leave the form', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(await screen.findByText('Fix leaking faucet'));
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Pick a date');

    act(() => pressHardwareBack(addListener));

    expect(screen.getByText('What needs doing?')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('step 1 has Next alone, full width: no footer Back', async () => {
    render(<HOCreateJobScreen onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Plumbing');

    expect(screen.queryByLabelText('Back to the previous step')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });

  it('from step 2 the footer Back goes back a step and does not leave the form', async () => {
    const onBack = jest.fn();
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fix leaking faucet');

    fireEvent.press(screen.getByRole('button', { name: 'Back to the previous step' }));

    expect(screen.getByText('Where is the job?')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('the header X is labelled Close on every step and never steps back', async () => {
    const onBack = jest.fn();
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fix leaking faucet');

    expect(screen.queryByRole('button', { name: 'Previous step' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByText('Discard this job?')).toBeTruthy();
    expect(screen.getByText('Fix leaking faucet')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('the header X on step 2 with progress asks to discard; Discard leaves', async () => {
    const onBack = jest.fn();
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fix leaking faucet');

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText('Discard this job?')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Discard'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Next with an empty description scrolls the form to it and does not advance', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    fireEvent.press(await screen.findByText('Fix leaking faucet'));
    fireEvent.changeText(screen.getByPlaceholderText('Describe the job in detail...'), '');
    scrollTo.mockClear();
    focus.mockClear();

    fireEvent.press(screen.getByText('Next'));

    expect(await screen.findByText(/Description must be at least/)).toBeTruthy();
    expect(scrollTo).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(screen.getByText('What needs doing?')).toBeTruthy();
    scrollTo.mockRestore();
    focus.mockRestore();
  });

  it('Next with an empty address focuses the address field', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.changeText(screen.getByTestId('create-job-address'), '');
    focus.mockClear();

    fireEvent.press(screen.getByText('Next'));

    expect(focus.mock.instances[0]).toMatchObject({ props: { testID: 'create-job-address' } });
    focus.mockRestore();
  });

  it('on the first step, back asks before discarding a job with a service chosen', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    render(<HOCreateJobScreen onBack={onBack} onSuccess={jest.fn()} />);
    fireEvent.press(await screen.findByText('Plumbing'));

    act(() => pressHardwareBack(addListener));

    expect(screen.getByText('Discard this job?')).toBeTruthy();
    expect(screen.getByText('Your answers will be lost.')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('Discard leaves the form', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    render(<HOCreateJobScreen onBack={onBack} onSuccess={jest.fn()} />);
    fireEvent.press(await screen.findByText('Plumbing'));
    act(() => pressHardwareBack(addListener));

    fireEvent.press(screen.getByLabelText('Discard'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Keep editing closes the question and stays on the form', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    render(<HOCreateJobScreen onBack={onBack} onSuccess={jest.fn()} />);
    fireEvent.press(await screen.findByText('Plumbing'));
    act(() => pressHardwareBack(addListener));

    fireEvent.press(screen.getByLabelText('Keep editing'));

    expect(screen.queryByText('Discard this job?')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText('What do you need help with?')).toBeTruthy();
  });

  it('with nothing entered, back leaves at once; the saved address prefilled by the app does not count', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    render(<HOCreateJobScreen onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Plumbing');

    act(() => pressHardwareBack(addListener));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard this job?')).toBeNull();
  });

  it('Close on the first step asks with progress and leaves without', async () => {
    const onBack = jest.fn();
    const { unmount } = render(<HOCreateJobScreen onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Plumbing');
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();

    const withProgress = jest.fn();
    render(<HOCreateJobScreen onBack={withProgress} onSuccess={jest.fn()} />);
    fireEvent.press(await screen.findByText('Plumbing'));
    fireEvent.press(screen.getByLabelText('Close'));

    expect(screen.getByText('Discard this job?')).toBeTruthy();
    expect(withProgress).not.toHaveBeenCalled();
  });

  it('back does nothing while the job is being posted', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    (api.createJob as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await fillInJobToReview();
    await act(async () => { fireEvent.press(screen.getByText('Post job')); });
    await screen.findByText('Posting your job...');

    act(() => pressHardwareBack(addListener));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByText('Posting your job...')).toBeTruthy();
  });

  it('after the job is posted, back leaves the form as it always did', async () => {
    const onBack = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    (api.createJob as jest.Mock).mockResolvedValueOnce({ id: 'new-job' });
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await fillInJobToReview();
    await act(async () => { fireEvent.press(screen.getByText('Post job')); });
    await screen.findByText('Job posted!');

    act(() => pressHardwareBack(addListener));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps App\'s own back handler out of the way for as long as the form is open', () => {
    const { unmount } = render(<HOCreateJobScreen onBack={jest.fn()} onSuccess={jest.fn()} />);
    expect(isBackBlockedByScreen()).toBe(true);

    unmount();

    expect(isBackBlockedByScreen()).toBe(false);
  });
});

it('a saved category list of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
  (api.categories as jest.Mock).mockReturnValue(new Promise(() => {}));

  await expectSavedCopyIgnored('categories', {}, () => render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />));
});
