/**
 * The job form's rules as pure functions. The screen asks these questions and
 * shows the answers; it does not decide them. The messages are the product's
 * wording and must not drift from what the form has always said.
 *
 * The limits are the backend's: CreateJobDto and the `jobs` CHECKs for the title,
 * description and tasks, and GeocodeQueryDto for the address (it is geocoded by
 * the same text, so it must be a length the geocoder accepts). The budget has no
 * ceiling on the backend, so the app holds it to the card limit: a job is hired
 * by card or by wallet, and a card cannot pay more than MAX_CARD_PHP.
 */

import { validateAmount, pesoWords } from './amountRules';
import { MAX_CARD_PHP } from './cardLimits';
import { textLength, textUnits, validateText, validateTitle } from './textRules';

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 750;
export const LOCATION_MIN = 5;
export const LOCATION_MAX = 300;
export const TASKS_MAX = 20;
export const TASK_MAX = 120;
/** The most a job budget may be: the most a card can pay (₱100,000). */
export const BUDGET_MAX_PHP = MAX_CARD_PHP;

/** Why a budget above the card limit is refused, in the product's wording. */
export function budgetOverMessage(max: number): string {
  return `Budgets above ${pesoWords(max)} can't be paid by card. Keep it at ${pesoWords(max)} or less.`;
}

export type PostField = 'service' | 'location' | 'tasks' | 'title' | 'description' | 'date' | 'time' | 'budget';
export type PostFieldErrors = Partial<Record<PostField, string>>;

export interface PostFormValues {
  categoryId: number | null;
  location: string;
  tasks: string[];
  title: string;
  description: string;
  date: Date | null;
  time: Date | null;
  budget: string;
}

/** The fields each step owns, in the order their errors are reported on screen. */
const STEP_FIELDS: Record<number, PostField[]> = {
  1: ['service'],
  2: ['location'],
  3: ['tasks', 'title', 'description'],
  4: ['date', 'time', 'budget'],
};

export function stepFields(step: number): PostField[] {
  return STEP_FIELDS[step] ?? [];
}

/**
 * The picker gives a day and a clock time as two objects, and the backend
 * stores one instant. They are combined in the device's own time zone, so
 * 9:00 AM means 9:00 AM where the client is.
 */
export function combineDateAndTime(day: Date, clock: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    clock.getHours(),
    clock.getMinutes(),
    0,
    0,
  );
}

/** Greater than zero, at most two decimal places, commas allowed. */
export function isValidBudget(value: string): boolean {
  const normalized = value.trim().replace(/,/g, '');
  if (normalized === '') return false;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return false;
  const parts = normalized.split('.');
  if (parts[1] && parts[1].length > 2) return false;
  return true;
}

function isBeforeToday(day: Date, now: Date): boolean {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return day < startOfToday;
}

/** Both pieces are chosen and their combined instant has already gone. */
function isPast(values: PostFormValues, now: Date): boolean {
  return !!values.date && !!values.time && combineDateAndTime(values.date, values.time).getTime() < now.getTime();
}

/** The message for one field right now, or undefined when the field is valid. */
export function fieldError(field: PostField, values: PostFormValues, now: Date): string | undefined {
  switch (field) {
    case 'service':
      return values.categoryId ? undefined : 'Please select a service.';
    case 'location': {
      if (!values.location.trim()) return 'Please enter where the job is.';
      return validateText(values.location, { min: LOCATION_MIN, max: LOCATION_MAX }) ?? undefined;
    }
    case 'tasks': {
      if (values.tasks.length === 0) return 'Pick at least one task so providers know what the job involves.';
      if (values.tasks.length > TASKS_MAX) return `You can add up to ${TASKS_MAX} tasks.`;
      const tooLong = values.tasks.some((task) => textUnits(task) > TASK_MAX || textLength(task) === 0);
      return tooLong ? `Each task needs 1 to ${TASK_MAX} characters.` : undefined;
    }
    case 'title':
      return validateTitle(values.title) ?? undefined;
    case 'description': {
      if (textLength(values.description) < DESCRIPTION_MIN) return `Description must be at least ${DESCRIPTION_MIN} characters.`;
      if (textUnits(values.description) > DESCRIPTION_MAX) return `Description cannot exceed ${DESCRIPTION_MAX} characters.`;
      return undefined;
    }
    case 'date':
      if (!values.date) return 'Please select a preferred date.';
      // A booking in the past is refused by the API, so it is caught here and
      // blamed on the field that caused it: the date when the day has gone...
      if (isPast(values, now) && isBeforeToday(values.date, now)) {
        return 'That date has already passed. Choose today or later.';
      }
      return undefined;
    case 'time':
      if (!values.time) return 'Please select a preferred time.';
      // ...or the time, when the day is today and only the clock has passed.
      if (values.date && isPast(values, now) && !isBeforeToday(values.date, now)) {
        return 'That time has already passed today. Choose a later time.';
      }
      return undefined;
    case 'budget':
      if (!values.budget.trim()) return 'Please set a budget for this job.';
      if (!isValidBudget(values.budget)) return 'Enter a valid amount greater than 0, up to 2 decimal places.';
      return validateAmount(values.budget, { max: BUDGET_MAX_PHP, overMessage: budgetOverMessage }) ?? undefined;
  }
}

/** Every error a step has right now, in the order its fields appear on screen. */
export function stepErrors(step: number, values: PostFormValues, now: Date): PostFieldErrors {
  const errors: PostFieldErrors = {};
  for (const field of stepFields(step)) {
    const message = fieldError(field, values, now);
    if (message) errors[field] = message;
  }
  return errors;
}

function sameErrors(a: PostFieldErrors, b: PostFieldErrors): boolean {
  const keysOf = (errors: PostFieldErrors) =>
    (Object.keys(errors) as PostField[]).filter((key) => errors[key] !== undefined);
  const keysA = keysOf(a);
  const keysB = keysOf(b);
  return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key]);
}

/**
 * Keeps the errors a step is already showing only while they are still true.
 * A field that has become valid loses its message at once; one that is still
 * invalid keeps a message, worded as the field now warrants. Nothing new is
 * added here, because errors only appear after the user presses Next.
 * Returns the same object when nothing changed, so the screen skips a render.
 */
export function reviseStepErrors(
  shown: PostFieldErrors,
  step: number,
  values: PostFormValues,
  now: Date,
): PostFieldErrors {
  const next: PostFieldErrors = {};
  for (const field of stepFields(step)) {
    if (!shown[field]) continue;
    const message = fieldError(field, values, now);
    if (message) next[field] = message;
  }
  return sameErrors(shown, next) ? shown : next;
}
