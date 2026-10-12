import type { Job } from '../api';
import {
  buildMyWorkRows,
  countMyWork,
  myWorkSections,
  type MyWorkApplication,
} from '../myWork';

const DAY_MS = 86_400_000;
const at = (day: number) => new Date(Date.UTC(2026, 9, 10) + day * DAY_MS).toISOString();

function makeJob(fields: Partial<Job> & Pick<Job, 'id' | 'title' | 'status'>): Job {
  return {
    client_id: 'client',
    category_id: 1,
    description: '',
    urgency: 'normal',
    address: 'Quezon City',
    latitude: 14.6,
    longitude: 121,
    provider_accept_address: null,
    provider_accept_latitude: null,
    provider_accept_longitude: null,
    posted_at: at(-5),
    assigned_provider_id: 'me',
    assigned_at: at(-2),
    completed_at: null,
    budget: 500,
    scheduled_at: null,
    photo_urls: [],
    created_at: at(-5),
    ...fields,
  } as Job;
}

function makeApplication(
  id: string,
  status: MyWorkApplication['status'],
  job: Partial<NonNullable<MyWorkApplication['jobs']>> & Pick<NonNullable<MyWorkApplication['jobs']>, 'id' | 'title' | 'status'>,
  times: { applied_at?: string; decided_at?: string | null } = {},
): MyWorkApplication {
  return {
    id,
    status,
    applied_at: times.applied_at ?? at(-4),
    decided_at: times.decided_at ?? null,
    jobs: { budget: 300, ...job },
  };
}

const titles = (rows: { title: string }[]) => rows.map((row) => row.title);

describe('buildMyWorkRows: hired jobs', () => {
  it('puts each hired status in its group', () => {
    const rows = buildMyWorkRows([], [
      makeJob({ id: 'a', title: 'In progress', status: 'in_progress' }),
      makeJob({ id: 'b', title: 'Awaiting answer', status: 'assigned' }),
      makeJob({ id: 'c', title: 'Confirmed', status: 'confirmed' }),
      makeJob({ id: 'd', title: 'Finished', status: 'completed' }),
      makeJob({ id: 'e', title: 'Cancelled', status: 'cancelled' }),
      makeJob({ id: 'f', title: 'Expired', status: 'expired' }),
    ]);

    const groups = Object.fromEntries(rows.map((row) => [row.title, row.group]));
    expect(groups).toEqual({
      'In progress': 'working',
      'Awaiting answer': 'booked',
      Confirmed: 'booked',
      Finished: 'done',
      Cancelled: 'closed',
      Expired: 'closed',
    });
  });

  it('leaves out a job that is still open, which a provider cannot be hired for', () => {
    const rows = buildMyWorkRows([], [makeJob({ id: 'open', title: 'Open', status: 'open' })]);
    expect(rows).toEqual([]);
  });

  it('shows working rows with their checklist progress, or just Working without a checklist', () => {
    const rows = buildMyWorkRows([], [
      makeJob({
        id: 'a',
        title: 'Checklist',
        status: 'in_progress',
        job_tasks: [
          { id: 't1', label: 'Drain', position: 0, is_done: true, completed_at: at(0) },
          { id: 't2', label: 'Seal', position: 1, is_done: false, completed_at: null },
        ],
      }),
      makeJob({ id: 'b', title: 'Plain', status: 'in_progress', job_tasks: [] }),
    ]);

    expect(rows.find((row) => row.title === 'Checklist')?.meta).toBe('Working · 1/2 tasks done');
    expect(rows.find((row) => row.title === 'Plain')?.meta).toBe('Working');
  });

  it('says a hired job waits for the provider until it is confirmed', () => {
    const rows = buildMyWorkRows([], [
      makeJob({ id: 'a', title: 'Hired', status: 'assigned' }),
      makeJob({ id: 'b', title: 'Confirmed', status: 'confirmed' }),
    ]);

    expect(rows.find((row) => row.title === 'Hired')?.meta).toBe('Booked · Awaiting your answer');
    expect(rows.find((row) => row.title === 'Confirmed')?.meta).toBe('Booked · Confirmed');
  });

  it('carries the scheduled date and budget onto the row', () => {
    const [row] = buildMyWorkRows([], [
      makeJob({ id: 'a', title: 'Dated', status: 'confirmed', scheduled_at: at(3), budget: 1200 }),
    ]);

    expect(row).toMatchObject({ jobId: 'a', scheduledAt: at(3), budget: 1200, tone: 'booked' });
  });
});

describe('buildMyWorkRows: proposals', () => {
  it('shows a pending proposal as Applied, waiting', () => {
    const [row] = buildMyWorkRows(
      [makeApplication('p1', 'pending', { id: 'j1', title: 'Pending', status: 'open' })],
      [],
    );

    expect(row).toMatchObject({
      group: 'applied', meta: 'Applied · waiting', tone: 'applied', budget: 300, jobId: 'j1', scheduledAt: null,
    });
  });

  it('closes a rejected or withdrawn proposal with the reason', () => {
    const rows = buildMyWorkRows([
      makeApplication('p1', 'rejected', { id: 'j1', title: 'Rejected', status: 'open' }),
      makeApplication('p2', 'withdrawn', { id: 'j2', title: 'Withdrawn', status: 'open' }),
    ], []);

    expect(rows.find((row) => row.title === 'Rejected')).toMatchObject({ group: 'closed', meta: 'Closed · Not selected' });
    expect(rows.find((row) => row.title === 'Withdrawn')).toMatchObject({ group: 'closed', meta: 'Closed · Withdrawn' });
  });

  it('closes a pending proposal whose job was cancelled or expired', () => {
    const rows = buildMyWorkRows([
      makeApplication('p1', 'pending', { id: 'j1', title: 'Cancelled job', status: 'cancelled' }),
      makeApplication('p2', 'pending', { id: 'j2', title: 'Expired job', status: 'expired' }),
    ], []);

    expect(rows.find((row) => row.title === 'Cancelled job')).toMatchObject({ group: 'closed', meta: 'Closed · Cancelled' });
    expect(rows.find((row) => row.title === 'Expired job')).toMatchObject({ group: 'closed', meta: 'Closed · Expired' });
  });

  it('leaves out an accepted proposal, because its job is listed from the hired jobs', () => {
    const rows = buildMyWorkRows(
      [makeApplication('p1', 'accepted', { id: 'j1', title: 'Hired', status: 'confirmed' })],
      [makeJob({ id: 'j1', title: 'Hired', status: 'confirmed' })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobId: 'j1', group: 'booked' });
  });

  it('lists a job once when both lists have it, keeping the hired row', () => {
    const rows = buildMyWorkRows(
      [makeApplication('p1', 'pending', { id: 'j1', title: 'Both', status: 'confirmed' })],
      [makeJob({ id: 'j1', title: 'Both', status: 'confirmed' })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe('booked');
  });

  it('skips a proposal whose job is missing from the response', () => {
    const rows = buildMyWorkRows([
      { id: 'p1', status: 'pending', applied_at: at(0), decided_at: null, jobs: null },
    ], []);

    expect(rows).toEqual([]);
  });
});

describe('countMyWork', () => {
  it('counts All and each group from the rows', () => {
    const rows = buildMyWorkRows(
      [
        makeApplication('p1', 'pending', { id: 'j1', title: 'Applied', status: 'open' }),
        makeApplication('p2', 'rejected', { id: 'j2', title: 'Rejected', status: 'open' }),
      ],
      [
        makeJob({ id: 'j3', title: 'Booked', status: 'confirmed' }),
        makeJob({ id: 'j4', title: 'Working', status: 'in_progress' }),
        makeJob({ id: 'j5', title: 'Done', status: 'completed' }),
      ],
    );

    expect(countMyWork(rows)).toEqual({ all: 5, applied: 1, booked: 1, working: 1, done: 1, closed: 1 });
  });

  it('counts zero for every filter when there are no rows', () => {
    expect(countMyWork([])).toEqual({ all: 0, applied: 0, booked: 0, working: 0, done: 0, closed: 0 });
  });
});

describe('myWorkSections', () => {
  const rows = buildMyWorkRows(
    [makeApplication('p1', 'pending', { id: 'j1', title: 'Applied job', status: 'open' })],
    [
      makeJob({ id: 'j2', title: 'Booked job', status: 'confirmed', scheduled_at: at(4) }),
      makeJob({ id: 'j3', title: 'Working job', status: 'in_progress' }),
      makeJob({ id: 'j4', title: 'Done job', status: 'completed', completed_at: at(-1) }),
    ],
  );

  it('under All, lists the groups in order with their labels and leaves out empty ones', () => {
    const sections = myWorkSections(rows, 'all');

    expect(sections.map((section) => section.label)).toEqual(['Working', 'Booked', 'Applied', 'Done']);
    expect(sections.map((section) => section.group)).toEqual(['working', 'booked', 'applied', 'done']);
  });

  it('under one filter, shows a single flat list without a label', () => {
    const sections = myWorkSections(rows, 'applied');

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeUndefined();
    expect(titles(sections[0].rows)).toEqual(['Applied job']);
  });

  it('under a filter with no rows, shows no sections', () => {
    expect(myWorkSections(rows, 'closed')).toEqual([]);
  });

  it('orders Working and Booked soonest first, with undated rows last', () => {
    const sorted = buildMyWorkRows([], [
      makeJob({ id: 'late', title: 'Late', status: 'confirmed', scheduled_at: at(9) }),
      makeJob({ id: 'none', title: 'No date', status: 'confirmed', scheduled_at: null }),
      makeJob({ id: 'soon', title: 'Soon', status: 'confirmed', scheduled_at: at(2) }),
    ]);

    const [booked] = myWorkSections(sorted, 'booked');
    expect(titles(booked.rows)).toEqual(['Soon', 'Late', 'No date']);
  });

  it('orders Applied, Done and Closed newest first', () => {
    const sorted = buildMyWorkRows(
      [
        makeApplication('old', 'pending', { id: 'j1', title: 'Older proposal', status: 'open' }, { applied_at: at(-6) }),
        makeApplication('new', 'pending', { id: 'j2', title: 'Newer proposal', status: 'open' }, { applied_at: at(-1) }),
      ],
      [
        makeJob({ id: 'd1', title: 'Finished first', status: 'completed', completed_at: at(-8) }),
        makeJob({ id: 'd2', title: 'Finished last', status: 'completed', completed_at: at(-2) }),
        makeJob({ id: 'c1', title: 'Cancelled', status: 'cancelled', assigned_at: at(-9) }),
      ],
    );

    expect(titles(myWorkSections(sorted, 'applied')[0].rows)).toEqual(['Newer proposal', 'Older proposal']);
    expect(titles(myWorkSections(sorted, 'done')[0].rows)).toEqual(['Finished last', 'Finished first']);
    expect(titles(myWorkSections(sorted, 'closed')[0].rows)).toEqual(['Cancelled']);
  });
});
