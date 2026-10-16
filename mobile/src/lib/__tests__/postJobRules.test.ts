import {
  combineDateAndTime,
  fieldError,
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
    expect(fieldError('budget', blank, NOW)).toBe('Please pick a price for this job.');
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

describe('the price', () => {
  it('asks the client to pick one of the estimated prices', () => {
    expect(fieldError('budget', { ...blank, budget: '' }, NOW)).toBe('Please pick a price for this job.');
    expect(fieldError('budget', { ...blank, budget: '1200' }, NOW)).toBeUndefined();
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

describe('the job form against the backend limits', () => {
  const at = (patch: Partial<PostFormValues>) => ({ ...valid, ...patch });

  it('keeps the address between 5 and 300 characters, the range the geocoder accepts', () => {
    const location = (value: string) => fieldError('location', at({ location: value }), NOW);
    expect(location('   ')).toBe('Please enter where the job is.');
    expect(location('abcd')).toBe('Add a few more words (at least 5 characters)');
    expect(location('  abcd  ')).toBe('Add a few more words (at least 5 characters)');
    expect(location('abcde')).toBeUndefined();
    expect(location('x'.repeat(300))).toBeUndefined();
    expect(location('x'.repeat(301))).toBe("Keep it under 300 characters (you're 1 over)");
  });

  it('does not count blank lines around a description as its length', () => {
    expect(fieldError('description', at({ description: `${'x'.repeat(19)}\n\n\n\n\n` }), NOW))
      .toBe('Description must be at least 20 characters.');
    expect(fieldError('description', at({ description: `${'x'.repeat(20)}\n\n\n\n\n` }), NOW)).toBeUndefined();
  });

  it('keeps the description at 750 UTF-16 units at most, and 20 characters at least', () => {
    expect(fieldError('description', at({ description: 'x'.repeat(750) }), NOW)).toBeUndefined();
    expect(fieldError('description', at({ description: 'x'.repeat(751) }), NOW))
      .toBe('Description cannot exceed 750 characters.');
    expect(fieldError('description', at({ description: '😀'.repeat(10) }), NOW))
      .toBe('Description must be at least 20 characters.');
  });

  it('keeps the title at 5 to 120 characters, measured after trimming', () => {
    const title = (value: string) => fieldError('title', at({ title: value }), NOW);
    expect(title('     ')).toBe('Title must be at least 5 characters.');
    expect(title('😀😀😀😀')).toBe('Title must be at least 5 characters.');
    expect(title('😀😀😀😀😀')).toBeUndefined();
    expect(title('x'.repeat(120))).toBeUndefined();
    expect(title('x'.repeat(121))).toBe('Title cannot exceed 120 characters.');
  });

  it('allows up to 20 tasks, each of 1 to 120 characters', () => {
    const tasks = (list: string[]) => fieldError('tasks', at({ tasks: list }), NOW);
    expect(tasks(Array.from({ length: 20 }, (_, i) => `Task ${i}`))).toBeUndefined();
    expect(tasks(Array.from({ length: 21 }, (_, i) => `Task ${i}`))).toBe('You can add up to 20 tasks.');
    expect(tasks(['x'.repeat(120)])).toBeUndefined();
    expect(tasks(['x'.repeat(121)])).toBe('Each task needs 1 to 120 characters.');
    expect(tasks(['   '])).toBe('Each task needs 1 to 120 characters.');
    expect(tasks([])).toBe('Pick at least one task so providers know what the job involves.');
  });

});
