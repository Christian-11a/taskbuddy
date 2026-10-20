import {
  applyConversationFilters, conversationSections, countUnreadChats, emptyCopy, serviceCounts, effectiveStatus,
  unreadOutsideFilter,
  type ConversationItem,
} from '../conversationFilters';

const mk = (id: string, over: Partial<ConversationItem> = {}): ConversationItem => ({
  id, job_id: `j${id}`, job_title: `Job ${id}`, job_status: 'confirmed', counterpart_name: `Person ${id}`,
  counterpart_avatar_url: null, last_message_at: `2026-10-0${id}T00:00:00Z`, created_at: '2026-09-01T00:00:00Z', ...over,
});
const list = [
  mk('1', { service: 'Plumbing' }),
  mk('2', { job_status: 'completed', service: 'Plumbing', unread_count: 2 }),
  mk('3', { job_status: 'cancelled', service: 'Cleaning' }),
  mk('4', { job_status: 'in_progress', service: 'Cleaning', unread_count: 1 }),
  mk('5', { job_status: 'completed', display_status: 'disputed' }),
];
const ids = (l: ConversationItem[]) => l.map((c) => c.id);

it('filters by active / finished / unread / all, newest first', () => {
  expect(ids(applyConversationFilters(list, { filter: 'active' }))).toEqual(['5', '4', '1']);
  expect(ids(applyConversationFilters(list, { filter: 'finished' }))).toEqual(['3', '2']);
  expect(ids(applyConversationFilters(list, { filter: 'unread' }))).toEqual(['4', '2']);
  expect(ids(applyConversationFilters(list, { filter: 'all' }))).toEqual(['5', '4', '3', '2', '1']);
});

it('counts unread chats and treats disputed as active', () => {
  expect(countUnreadChats(list)).toBe(2);
  expect(effectiveStatus(list[4])).toBe('disputed');
});

it('counts unread chats hidden by the current filter', () => {
  const l = [
    mk('1', { job_status: 'completed', unread_count: 2 }),
    mk('2', { job_status: 'confirmed', unread_count: 1 }),
    mk('3', { job_status: 'completed', unread_count: 0 }),
  ];
  expect(unreadOutsideFilter(l, 'active')).toBe(1);
  expect(unreadOutsideFilter(l, 'finished')).toBe(1);
  expect(unreadOutsideFilter(l, 'unread')).toBe(0);
  expect(unreadOutsideFilter(l, 'all')).toBe(0);
  expect(unreadOutsideFilter([], 'active')).toBe(0);
});

it('searches title or name and filters by service', () => {
  expect(ids(applyConversationFilters(list, { filter: 'all', query: 'person 3' }))).toEqual(['3']);
  expect(ids(applyConversationFilters(list, { filter: 'all', query: 'JOB 4' }))).toEqual(['4']);
  expect(ids(applyConversationFilters(list, { filter: 'all', service: 'Cleaning' }))).toEqual(['4', '3']);
});

it('counts services', () => {
  expect(serviceCounts(list)).toEqual([{ name: 'Cleaning', count: 2 }, { name: 'Plumbing', count: 2 }]);
  expect(serviceCounts([mk('1')])).toEqual([]);
});

it('builds sections only for All', () => {
  const all = applyConversationFilters(list, { filter: 'all' });
  expect(conversationSections(all, 'all').map((s) => [s.title, ids(s.data)])).toEqual([
    ['Active jobs', ['5', '4', '1']], ['Finished', ['3', '2']],
  ]);
  expect(conversationSections(all, 'active')).toHaveLength(1);
  expect(conversationSections([], 'all')).toEqual([]);
});

it('words empty states per role', () => {
  expect(emptyCopy('active', 'client')).toEqual({ title: 'No active chats', body: 'Chats start when you hire a provider.' });
  expect(emptyCopy('active', 'provider').body).toBe('Chats start when a client hires you.');
  expect(emptyCopy('unread', 'client').title).toBe('No unread chats');
});
