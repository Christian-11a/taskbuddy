import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { BackHandler, ScrollView, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import HOCreateJobScreen from '../HOCreateJobScreen';
import { api } from '../../../../src/lib/api';
import { showToast } from '../../../../src/components/Toast';
import { isBackBlockedByScreen } from '../../../../src/hooks/useLeaveGuard';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';

jest.mock('../../../../src/lib/api', () => ({ api: {
  categories: jest.fn(), createJob: jest.fn(), uploadImage: jest.fn(),
} }));
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
  fireEvent.press(screen.getByText('Next'));
  await waitFor(() => expect(screen.getAllByText('Please select a preferred date.').length).toBeGreaterThan(0));
  expect(screen.getByText('Please set a budget for this job.')).toBeTruthy();
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
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByLabelText('Open selected photo 2'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe('file:///landscape');
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.getByTestId('create-job-review')).toBeTruthy();
  expect(screen.queryByText(/I agree to the/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Post job')));
  expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({budget: 1500, tasks: ['Fix leaking faucet']}));
  expect(await screen.findByText('Post another job')).toBeTruthy();
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

it('clears a budget error as soon as a valid amount is typed, and leaves other errors alone', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Pick a date');
  fireEvent.press(screen.getByText('Next'));

  const budgetMessage = 'Please set a budget for this job.';
  expect(await screen.findByText(budgetMessage)).toBeTruthy();
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
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
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
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
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
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
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
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
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
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

it('every control has an accessible name on the first step: back, the service and the location', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
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

  it('keeps letters out of the budget and cuts a third decimal place', async () => {
    await openBudgetStep();
    const budget = () => screen.getByPlaceholderText('0.00');

    fireEvent.changeText(budget(), 'pesos');
    expect(budget().props.value).toBe('');

    fireEvent.changeText(budget(), '1500.999');
    expect(budget().props.value).toBe('1500.99');
  });

  it('focusing the budget scrolls the form so the field clears the keyboard and the footer', async () => {
    await openBudgetStep();
    fireEvent(screen.getByTestId('create-job-form-scroll'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 400 } },
    });
    // Measured the way the KeyboardAwareScrollView tests measure: the view's window top is 100, the budget's is 600.
    type MeasureCallback = (x: number, y: number, width: number, height: number) => void;
    const scroll = screen.UNSAFE_getAllByType(ScrollView)
      .find((node) => node.props.testID === 'create-job-form-scroll')!.instance;
    // The ScrollView and TextInput mocks share one jest.fn per method across instances, so clear the earlier step calls.
    const scrollTo = jest.spyOn(scroll, 'scrollTo');
    scrollTo.mockClear();
    const measureScroller = jest.spyOn(scroll, 'getNativeScrollRef').mockReturnValue({
      measureInWindow: (callback: MeasureCallback) => callback(0, 100, 375, 400),
    } as never);
    const budget: { measureInWindow: (callback: MeasureCallback) => void } = screen.UNSAFE_getAllByType(TextInput)
      .find((node) => node.props.placeholder === '0.00')!.instance;
    const measureBudget = jest.spyOn(budget, 'measureInWindow').mockImplementation((callback) => callback(0, 600, 375, 48));

    fireEvent(screen.getByPlaceholderText('0.00'), 'focus');

    // The budget is 500 dp into a 400 dp view; its bottom plus the 24 dp margin is 172 past the view's bottom edge.
    expect(scrollTo).toHaveBeenCalledWith({ y: 172, animated: true });

    // Those mocks are shared by every instance in this file, so put them back to the defaults the other tests get.
    measureScroller.mockReset();
    measureBudget.mockReset();
  });

  it('a pasted 1e3 or -1000 leaves the budget as it was, instead of 13 or 1000', async () => {
    await openBudgetStep();
    const budget = () => screen.getByPlaceholderText('0.00');

    fireEvent.changeText(budget(), '1500');
    fireEvent.changeText(budget(), '1e3');
    expect(budget().props.value).toBe('1500');

    fireEvent.changeText(budget(), '-1000');
    expect(budget().props.value).toBe('1500');
  });

  it('refuses a budget above the ₱100,000 a card can pay once Next is pressed', async () => {
    await openBudgetStep();
    fireEvent.press(screen.getByText('Pick a date'));
    fireEvent.press(screen.getByText('Choose test date'));
    fireEvent.press(screen.getByText('Pick a time'));
    fireEvent.press(screen.getByText('Choose test time'));
    if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '100001');

    fireEvent.press(screen.getByText('Next'));

    expect(await screen.findByText("Budgets above ₱100,000 can't be paid by card. Keep it at ₱100,000 or less.")).toBeTruthy();
    expect(api.createJob).not.toHaveBeenCalled();
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
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
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

  it('after the first step the footer has Next alone: the header arrow is the one way back', async () => {
    render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fix leaking faucet');

    expect(screen.queryByText('Back')).toBeNull();
    expect(screen.queryByLabelText('Back to the previous step')).toBeNull();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });

  it('the header arrow goes back a step too, and is announced as going back', async () => {
    const onBack = jest.fn();
    render(<HOCreateJobScreen initialCategoryId={1} onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Location confirmed');
    fireEvent.press(screen.getByText('Next'));
    await screen.findByText('Fix leaking faucet');

    fireEvent.press(screen.getByRole('button', { name: 'Previous step' }));

    expect(screen.getByText('Where is the job?')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
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

  it('Exit job form on the first step behaves like back there: asks with progress, leaves without', async () => {
    const onBack = jest.fn();
    const { unmount } = render(<HOCreateJobScreen onBack={onBack} onSuccess={jest.fn()} />);
    await screen.findByText('Plumbing');
    fireEvent.press(screen.getByLabelText('Exit job form'));
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();

    const withProgress = jest.fn();
    render(<HOCreateJobScreen onBack={withProgress} onSuccess={jest.fn()} />);
    fireEvent.press(await screen.findByText('Plumbing'));
    fireEvent.press(screen.getByLabelText('Exit job form'));

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
