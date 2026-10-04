import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { clearAsyncDataCache, useAsyncData } from '../useAsyncData';

function Probe({
  service,
  fetcher,
}: {
  service: string;
  fetcher: () => Promise<string>;
}) {
  const { data } = useAsyncData(fetcher, [service], service);
  return <Text>{data ?? 'Loading'}</Text>;
}
beforeEach(clearAsyncDataCache);
it('does not let a response for older services overwrite the current service cache', async () => {
  let finishOld!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finishOld = resolve;
  });
  const view = render(<Probe service="plumbing" fetcher={() => pending} />);
  view.rerender(
    <Probe
      service="plumbing-pedicure"
      fetcher={() => Promise.resolve('New eligible jobs')}
    />,
  );
  await screen.findByText('New eligible jobs');
  await act(async () => finishOld('Old eligible jobs'));
  view.unmount();
  render(
    <Probe service="plumbing-pedicure" fetcher={() => new Promise(() => {})} />,
  );
  expect(screen.getByText('New eligible jobs')).toBeTruthy();
  expect(screen.queryByText('Old eligible jobs')).toBeNull();
});
it('does not repopulate a cleared account cache when an unmounted request resolves', async () => {
  let finishOld!: (value: string) => void;
  const fetcher = jest.fn(
    () =>
      new Promise<string>((resolve) => {
        finishOld = resolve;
      }),
  );
  const view = render(<Probe service="profile" fetcher={fetcher} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.unmount();
  clearAsyncDataCache();
  await act(async () => finishOld('Old account'));
  render(<Probe service="profile" fetcher={() => new Promise(() => {})} />);
  expect(screen.getByText('Loading')).toBeTruthy();
});
