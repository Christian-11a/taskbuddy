import { api, configureApiAuth } from '../api';

afterEach(() => jest.restoreAllMocks());
it('sends urgency to the API so it filters before pagination', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, status: 200, text: async () => JSON.stringify({ jobs: [], summary: {} }),
  } as Response);
  configureApiAuth(() => 'test-token', jest.fn());
  await api.browseJobs({ urgency: 'flexible', limit: 20 });
  expect(String(fetchMock.mock.calls[0][0])).toContain('urgency=flexible');
  expect(String(fetchMock.mock.calls[0][0])).toContain('limit=20');
});
