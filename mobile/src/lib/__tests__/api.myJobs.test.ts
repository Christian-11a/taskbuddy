import { api, configureApiAuth } from '../api';
afterEach(() => jest.restoreAllMocks());
it('collects every matching page beyond the REST row cap with service/status filters on each request', async () => {
  const rows = Array.from({ length: 1101 }, (_, index) => ({
    id: `job-${index}`,
  }));
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get('offset'));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(rows.slice(offset, offset + 100)),
      } as Response;
    });
  configureApiAuth(() => 'test-token', jest.fn());
  const jobs = await api.myJobs({ category_id: 2, status_group: 'ongoing' });
  expect(jobs).toHaveLength(1101);
  expect(jobs[1100].id).toBe('job-1100');
  expect(fetch).toHaveBeenCalledTimes(12);
  for (const [index, call] of fetch.mock.calls.entries()) {
    const params = new URL(String(call[0])).searchParams;
    expect(params.get('category_id')).toBe('2');
    expect(params.get('status_group')).toBe('ongoing');
    expect(params.get('offset')).toBe(String(index * 100));
  }
});
it('does not return a misleading partial list when a later page fails', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ id }))),
    } as Response)
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ message: 'Service unavailable' }),
    } as Response);
  configureApiAuth(() => 'test-token', jest.fn());
  await expect(api.myJobs({})).rejects.toThrow('Service unavailable');
});
