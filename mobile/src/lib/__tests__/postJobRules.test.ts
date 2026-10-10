import {
  combineDateAndTime,
  fieldError,
  isValidBudget,
  reviseStepErrors,
  stepErrors,
  stepFields,
  type PostFormValues,
} from '../postJobRules';

// Fixed clock: 10 June 2030 at noon, local time.
const NOW = new Date(2030, 5, 10, 12, 0, 0);
const TODAY = new Date(2030, 5, 10);
const YESTERDAY = new Date(2030, 5, 9);
const TOMORROW = new Date(2030, 5, 11);
const clock = (hours: number, minutes = 0) => new Date(2030, 0, 1, hours, minutes, 0, 0);

const blank: PostFormValues = {
  categoryId: null,
  location: '',
  tasks: [],
  title: '',
  description: '',
  date: null,
  time: null,
  budget: '',
};
const valid: PostFormValues = {
  categoryId: 1,
  location: 'Quezon City',
  tasks: ['Fix leaking faucet'],
  title: 'Plumbing: Fix leaking faucet',
  description: 'Plumbing service needed. Tasks: Fix leaking faucet.',
  date: TOMORROW,
  time: clock(9),
  budget: '1500',
};

describe('the messages', () => {
  it('names each missing field in the words the form has always used', () => {
    expect(fieldError('service', blank, NOW)).toBe('Please select a service.');
    expect(fieldError('location', blank, NOW)).toBe('Please enter where the job is.');
    expect(fieldError('tasks', blank, NOW)).toBe('Pick at least one task so providers know what the job involves.');
    expect(fieldError('date', blank, NOW)).toBe('Please select a preferred date.');
    expect(fieldError('time', blank, NOW)).toBe('Please select a preferred time.');
    expect(fieldError('budget', blank, NOW)).toBe('Please set a budget for this job.');
  });

  it('treats a blank location as missing', () => {
    expect(fieldError('location', { ...blank, location: '   ' }, NOW)).toBe('Please enter where the job is.');
  });

  it('keeps the title between 5 and 120 characters, after trimming', () => {
    const title = (value: string) => fieldError('title', { ...blank, title: value }, NOW);
    expect(title('abcd')).toBe('Title must be at least 5 characters.');
    expect(title('  abcd  ')).toBe('Title must be at least 5 characters.');
    expect(title('abcde')).toBeUndefined();
    expect(title('x'.repeat(120))).toBeUndefined();
    expect(title('x'.repeat(121))).toBe('Title cannot exceed 120 characters.');
  });

  it('keeps the description between 20 and 750 characters, after trimming', () => {
    const description = (value: string) => fieldError('description', { ...blank, description: value }, NOW);
    expect(description('x'.repeat(19))).toBe('Description must be at least 20 characters.');
    expect(description('x'.repeat(20))).toBeUndefined();
    expect(description('x'.repeat(750))).toBeUndefined();
    expect(description('x'.repeat(751))).toBe('Description cannot exceed 750 characters.');
  });

  it('refuses a date or a time that has already gone, and blames the field that caused it', () => {
    const past = (date: Date, time: Date) => ({ ...blank, date, time });
    expect(fieldError('date', past(YESTERDAY, clock(10)), NOW)).toBe('That date has already passed. Choose today or later.');
    expect(fieldError('time', past(YESTERDAY, clock(10)), NOW)).toBeUndefined();

    expect(fieldError('time', past(TODAY, clock(9)), NOW)).toBe('That time has already passed today. Choose a later time.');
    expect(fieldError('date', past(TODAY, clock(9)), NOW)).toBeUndefined();

    expect(fieldError('date', past(TODAY, clock(15)), NOW)).toBeUndefined();
    expect(fieldError('time', past(TODAY, clock(15)), NOW)).toBeUndefined();
  });
});

describe('the budget', () => {
  it('accepts a positive amount with at most two decimal places and optional commas', () => {
    expect(isValidBudget('1500')).toBe(true);
    expect(isValidBudget('1,500.50')).toBe(true);
    expect(isValidBudget('0.5')).toBe(true);
  });

  it('refuses blanks, zero, negatives, words and a third decimal place', () => {
    expect(isValidBudget('')).toBe(false);
    expect(isValidBudget('0')).toBe(false);
    expect(isValidBudget('-5')).toBe(false);
    expect(isValidBudget('abc')).toBe(false);
    expect(isValidBudget('12.345')).toBe(false);
  });

  it('asks for a budget first, then for a valid one', () => {
    expect(fieldError('budget', { ...blank, budget: '  ' }, NOW)).toBe('Please set a budget for this job.');
    expect(fieldError('budget', { ...blank, budget: 'abc' }, NOW)).toBe(
      'Enter a valid amount greater than 0, up to 2 decimal places.',
    );
  });
});

describe('which fields belong to which step', () => {
  it('follows the five steps, with the review holding no fields of its own', () => {
    expect(stepFields(1)).toEqual(['service']);
    expect(stepFields(2)).toEqual(['location']);
    expect(stepFields(3)).toEqual(['tasks', 'title', 'description']);
    expect(stepFields(4)).toEqual(['date', 'time', 'budget']);
    expect(stepFields(5)).toEqual([]);
  });

  it('reports a step\'s errors in the order its fields appear on screen', () => {
    expect(Object.keys(stepErrors(3, blank, NOW))).toEqual(['tasks', 'title', 'description']);
    expect(Object.keys(stepErrors(4, blank, NOW))).toEqual(['date', 'time', 'budget']);
  });

  it('reports nothing for a step whose fields are all valid', () => {
    expect(stepErrors(1, valid, NOW)).toEqual({});
    expect(stepErrors(2, valid, NOW)).toEqual({});
    expect(stepErrors(3, valid, NOW)).toEqual({});
    expect(stepErrors(4, valid, NOW)).toEqual({});
  });
});

describe('keeping errors honest as the user edits', () => {
  it('drops an error at once when its field becomes valid', () => {
    const shown = { title: 'Title must be at least 5 characters.' };
    expect(reviseStepErrors(shown, 3, { ...valid, title: 'Plumbing' }, NOW)).toEqual({});
  });

  it('keeps an error while the field is still invalid', () => {
    const shown = { title: 'Title must be at least 5 characters.' };
    const next = reviseStepErrors(shown, 3, { ...valid, title: 'abc' }, NOW);
    expect(next).toEqual({ title: 'Title must be at least 5 characters.' });
  });

  it('refreshes the wording when an error changes but stays', () => {
    const shown = { title: 'Title must be at least 5 characters.' };
    expect(reviseStepErrors(shown, 3, { ...valid, title: 'x'.repeat(121) }, NOW)).toEqual({
      title: 'Title cannot exceed 120 characters.',
    });
  });

  it('never invents an error the user has not been shown', () => {
    expect(reviseStepErrors({}, 3, blank, NOW)).toEqual({});
  });

  it('forgets errors that belong to another step', () => {
    expect(reviseStepErrors({ location: 'Please enter where the job is.' }, 3, blank, NOW)).toEqual({});
  });

  it('clears a time error when the date moves to a day that has not started', () => {
    const shown = { time: 'That time has already passed today. Choose a later time.' };
    const edited = { ...valid, date: TOMORROW, time: clock(9) };
    expect(reviseStepErrors(shown, 4, edited, NOW)).toEqual({});
  });

  it('returns the same object when nothing changed, so the screen does not re-render', () => {
    const shown = { title: 'Title must be at least 5 characters.' };
    expect(reviseStepErrors(shown, 3, { ...valid, title: 'abc' }, NOW)).toBe(shown);
    const none = {};
    expect(reviseStepErrors(none, 3, valid, NOW)).toBe(none);
  });

  it('ignores keys that were cleared to undefined', () => {
    const shown = { location: undefined } as Record<string, string | undefined>;
    expect(reviseStepErrors(shown, 2, valid, NOW)).toBe(shown);
  });
});

describe('combineDateAndTime', () => {
  it('takes the day from the date and the time from the clock, in the device zone', () => {
    const combined = combineDateAndTime(new Date(2030, 6, 4), new Date(2001, 0, 1, 14, 35, 59));
    expect(combined.getFullYear()).toBe(2030);
    expect(combined.getMonth()).toBe(6);
    expect(combined.getDate()).toBe(4);
    expect(combined.getHours()).toBe(14);
    expect(combined.getMinutes()).toBe(35);
    expect(combined.getSeconds()).toBe(0);
  });
});
