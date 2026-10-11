import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAsyncDataCache, useAsyncData, type AsyncDataOptions } from '../useAsyncData';
import { readPersisted, setCacheAccount } from '../../lib/persistentCache';

// A pass-through spy: most tests read the real saved copy, while some hold the read back to decide when
// it lands relative to the fetch.
jest.mock('../../lib/persistentCache', () => {
  const actual = jest.requireActual('../../lib/persistentCache');
  return { ...actual, readPersisted: jest.fn(actual.readPersisted) };
});

const actualReadPersisted = jest.requireActual('../../lib/persistentCache').readPersisted;
const readSaved = readPersisted as unknown as jest.Mock;
type SavedRead = { value: string; savedAt: number } | null;

const ACCOUNT = 'acct-alice';
const HOUR = 60 * 60 * 1000;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Probe({
  cacheKey,
  fetcher,
  options,
}: {
  cacheKey: string;
  fetcher: () => Promise<string>;
  options?: AsyncDataOptions;
}) {
  const state = useAsyncData(fetcher, [cacheKey], cacheKey, options);
  return (
    <>
      <Text>{state.data ?? 'nothing yet'}</Text>
      <Text>{`loading:${state.loading}`}</Text>
      <Text>{`stale:${state.stale}`}</Text>
      <Text>{`refreshing:${state.refreshing}`}</Text>
      <Text>{`savedOnly:${state.savedOnly}`}</Text>
      <Text>{`error:${state.error ?? 'none'}`}</Text>
    </>
  );
}

/** Lets pending storage and fetch callbacks run to the end. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Saves a copy under the account, the way an earlier launch would have. */
async function seed(key: string, value: unknown, savedAt = Date.now(), account = ACCOUNT) {
  await AsyncStorage.setItem(
    `taskbuddy.cache.v1.${account}.${key}`,
    JSON.stringify({ v: 1, savedAt, value }),
  );
}

async function savedKeysOnDevice(): Promise<string[]> {
  return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('taskbuddy.cache.v1.'));
}

beforeEach(async () => {
  jest.clearAllMocks();
  readSaved.mockReset();
  readSaved.mockImplementation(actualReadPersisted);
  await AsyncStorage.clear();
  clearAsyncDataCache();
  setCacheAccount(ACCOUNT);
});

afterEach(() => {
  setCacheAccount(null);
});

describe('with persist on, for a key that may be saved', () => {
  it('shows the saved value at once, as stale, then replaces it with the fresh fetch', async () => {
    await seed('ho-jobs', 'saved jobs');
    const fresh = deferred<string>();
    render(<Probe cacheKey="ho-jobs" fetcher={() => fresh.promise} options={{ persist: true }} />);

    expect(await screen.findByText('saved jobs')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
    expect(screen.getByText('stale:true')).toBeTruthy();
    expect(screen.getByText('refreshing:true')).toBeTruthy();

    await act(async () => fresh.resolve('fresh jobs'));

    expect(await screen.findByText('fresh jobs')).toBeTruthy();
    expect(screen.getByText('stale:false')).toBeTruthy();
    expect(screen.getByText('refreshing:false')).toBeTruthy();
    expect(await readPersisted<string>('ho-jobs')).toEqual({
      value: 'fresh jobs',
      savedAt: expect.any(Number),
    });
  });

  it('keeps the saved value on screen when the refresh fails, and reports the error', async () => {
    await seed('ho-jobs', 'saved jobs');
    const fresh = deferred<string>();
    render(<Probe cacheKey="ho-jobs" fetcher={() => fresh.promise} options={{ persist: true }} />);
    expect(await screen.findByText('saved jobs')).toBeTruthy();

    await act(async () => fresh.reject(new Error('Network request failed')));

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('saved jobs')).toBeTruthy();
    expect(screen.getByText('stale:true')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
    expect(screen.getByText('refreshing:false')).toBeTruthy();
    expect(await readPersisted<string>('ho-jobs')).toEqual({
      value: 'saved jobs',
      savedAt: expect.any(Number),
    });
  });

  it('a failed fetch with nothing saved behaves as before: no data, the error, not loading', async () => {
    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => Promise.reject(new Error('Network request failed'))}
        options={{ persist: true }}
      />,
    );

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('nothing yet')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
    expect(screen.getByText('stale:false')).toBeTruthy();
  });

  it('ignores a saved copy that arrives after the fresh fetch has finished', async () => {
    const saved = deferred<SavedRead>();
    readSaved.mockImplementationOnce(() => saved.promise);
    render(
      <Probe cacheKey="ho-jobs" fetcher={() => Promise.resolve('fresh jobs')} options={{ persist: true }} />,
    );
    expect(await screen.findByText('fresh jobs')).toBeTruthy();

    await act(async () => saved.resolve({ value: 'old jobs', savedAt: Date.now() - 1000 }));

    expect(screen.getByText('fresh jobs')).toBeTruthy();
    expect(screen.queryByText('old jobs')).toBeNull();
    expect(screen.getByText('stale:false')).toBeTruthy();
  });

  it('ignores a saved copy that arrives after the screen has moved on to another key', async () => {
    const saved = deferred<SavedRead>();
    readSaved.mockImplementationOnce(() => saved.promise);
    const view = render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => new Promise<string>(() => {})}
        options={{ persist: true }}
      />,
    );
    view.rerender(
      <Probe cacheKey="ho-wallet" fetcher={() => Promise.resolve('wallet')} options={{ persist: true }} />,
    );
    expect(await screen.findByText('wallet')).toBeTruthy();

    await act(async () => saved.resolve({ value: 'jobs saved', savedAt: Date.now() }));

    expect(screen.queryByText('jobs saved')).toBeNull();
    expect(screen.getByText('wallet')).toBeTruthy();
  });

  it('ignores a saved copy that arrives after the screen has gone', async () => {
    const saved = deferred<SavedRead>();
    readSaved.mockImplementationOnce(() => saved.promise);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => new Promise<string>(() => {})}
        options={{ persist: true }}
      />,
    );
    view.unmount();

    await act(async () => saved.resolve({ value: 'jobs saved', savedAt: Date.now() }));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('does not read the saved copy while the memory cache already holds the key, and shows the memory value at once', async () => {
    const first = render(
      <Probe cacheKey="ho-jobs" fetcher={() => Promise.resolve('first jobs')} options={{ persist: true }} />,
    );
    expect(await screen.findByText('first jobs')).toBeTruthy();
    first.unmount();
    readSaved.mockClear();

    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => new Promise<string>(() => {})}
        options={{ persist: true }}
      />,
    );

    expect(screen.getByText('first jobs')).toBeTruthy();
    expect(screen.getByText('stale:false')).toBeTruthy();
    expect(readSaved).not.toHaveBeenCalled();
  });

  it('does not save a result under an account that changed while the fetch was running', async () => {
    const fetch = deferred<string>();
    render(<Probe cacheKey="ho-jobs" fetcher={() => fetch.promise} options={{ persist: true }} />);
    setCacheAccount('acct-bob');

    await act(async () => fetch.resolve('alice jobs'));

    expect(await screen.findByText('alice jobs')).toBeTruthy();
    expect(await savedKeysOnDevice()).toEqual([]);
  });

  it('never shows a saved copy that belongs to another account', async () => {
    await seed('ho-jobs', 'bob jobs', Date.now(), 'acct-bob');
    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => new Promise<string>(() => {})}
        options={{ persist: true }}
      />,
    );

    await settle();

    expect(screen.queryByText('bob jobs')).toBeNull();
    expect(screen.getByText('loading:true')).toBeTruthy();
  });

  it('a saved copy older than maxAgeMs is not shown until the fetch lands', async () => {
    await seed('ho-jobs', 'two hours old', Date.now() - 2 * HOUR);
    const fresh = deferred<string>();
    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => fresh.promise}
        options={{ persist: true, maxAgeMs: HOUR }}
      />,
    );

    await settle();
    expect(screen.queryByText('two hours old')).toBeNull();
    expect(screen.getByText('loading:true')).toBeTruthy();

    await act(async () => fresh.resolve('fresh jobs'));

    expect(await screen.findByText('fresh jobs')).toBeTruthy();
  });

  it('a key that may not be saved is never read or written, even with persist on', async () => {
    await seed('ho-withdrawals', 'stale withdrawals');
    jest.clearAllMocks();
    render(
      <Probe
        cacheKey="ho-withdrawals"
        fetcher={() => Promise.resolve('fresh withdrawals')}
        options={{ persist: true }}
      />,
    );

    expect(await screen.findByText('fresh withdrawals')).toBeTruthy();
    await settle();
    expect(readSaved).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(screen.getByText('stale:false')).toBeTruthy();
  });

  it('without an account set, nothing is read or saved', async () => {
    setCacheAccount(null);
    render(
      <Probe cacheKey="ho-jobs" fetcher={() => Promise.resolve('fresh jobs')} options={{ persist: true }} />,
    );

    expect(await screen.findByText('fresh jobs')).toBeTruthy();
    await settle();
    expect(readSaved).not.toHaveBeenCalled();
    expect(await savedKeysOnDevice()).toEqual([]);
  });
});

describe('when the first fetch fails before the saved copy has been read', () => {
  it('waits for the saved read, then shows the saved copy together with the error', async () => {
    const saved = deferred<SavedRead>();
    readSaved.mockImplementationOnce(() => saved.promise);
    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => Promise.reject(new Error('Network request failed'))}
        options={{ persist: true }}
      />,
    );

    await settle();
    // The error waits for the saved read, so an offline launch can still show what was saved.
    expect(screen.queryByText('error:Network request failed')).toBeNull();
    expect(screen.getByText('loading:true')).toBeTruthy();

    await act(async () => saved.resolve({ value: 'saved jobs', savedAt: Date.now() - 1000 }));

    expect(await screen.findByText('saved jobs')).toBeTruthy();
    expect(screen.getByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('stale:true')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
    expect(screen.getByText('refreshing:false')).toBeTruthy();
  });

  it('shows the error alone when the saved read settles with nothing to show', async () => {
    const saved = deferred<SavedRead>();
    readSaved.mockImplementationOnce(() => saved.promise);
    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => Promise.reject(new Error('Network request failed'))}
        options={{ persist: true }}
      />,
    );

    await settle();
    expect(screen.queryByText('error:Network request failed')).toBeNull();

    await act(async () => saved.resolve(null));

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('nothing yet')).toBeTruthy();
    expect(screen.getByText('stale:false')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
  });

  it.each<[string, () => Promise<void>, string, string]>([
    ['a copy from this account', () => seed('ho-jobs', 'saved jobs'), 'saved jobs', 'stale:true'],
    ['no copy at all', async () => undefined, 'nothing yet', 'stale:false'],
    [
      'a copy older than maxAgeMs',
      () => seed('ho-jobs', 'old jobs', Date.now() - 2 * HOUR),
      'nothing yet',
      'stale:false',
    ],
    ['a copy from another account', () => seed('ho-jobs', 'bob jobs', Date.now(), 'acct-bob'), 'nothing yet', 'stale:false'],
    [
      'a copy that cannot be read',
      async () => {
        readSaved.mockImplementationOnce(() => Promise.reject(new Error('Storage unavailable')));
      },
      'nothing yet',
      'stale:false',
    ],
  ])('with %s, the error shows next to whatever can be read', async (_name, setup, shown, staleText) => {
    await setup();
    render(
      <Probe
        cacheKey="ho-jobs"
        fetcher={() => Promise.reject(new Error('Network request failed'))}
        options={{ persist: true, maxAgeMs: HOUR }}
      />,
    );

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText(shown)).toBeTruthy();
    expect(screen.getByText(staleText)).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
  });

  it('drops both the failure and a late saved copy once the screen has moved on to another key', async () => {
    const saved = deferred<SavedRead>();
    readSaved.mockImplementationOnce(() => saved.promise);
    const failing = deferred<string>();
    const view = render(<Probe cacheKey="ho-jobs" fetcher={() => failing.promise} options={{ persist: true }} />);
    view.rerender(
      <Probe cacheKey="ho-wallet" fetcher={() => Promise.resolve('wallet')} options={{ persist: true }} />,
    );
    expect(await screen.findByText('wallet')).toBeTruthy();

    await act(async () => failing.reject(new Error('Network request failed')));
    await act(async () => saved.resolve({ value: 'jobs saved', savedAt: Date.now() }));

    expect(screen.getByText('wallet')).toBeTruthy();
    expect(screen.queryByText('error:Network request failed')).toBeNull();
    expect(screen.queryByText('jobs saved')).toBeNull();
    expect(screen.getByText('stale:false')).toBeTruthy();
  });
});

describe('savedOnly: the data on screen is nothing but the saved copy', () => {
  it('is true while the saved copy is the only data, and stays true when the refresh fails', async () => {
    await seed('ho-wallet', 'saved wallet');
    const fresh = deferred<string>();
    render(<Probe cacheKey="ho-wallet" fetcher={() => fresh.promise} options={{ persist: true }} />);
    expect(await screen.findByText('saved wallet')).toBeTruthy();
    expect(screen.getByText('savedOnly:true')).toBeTruthy();

    await act(async () => fresh.reject(new Error('Network request failed')));

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('saved wallet')).toBeTruthy();
    expect(screen.getByText('savedOnly:true')).toBeTruthy();
  });

  it('clears once a fetch lands', async () => {
    await seed('ho-wallet', 'saved wallet');
    const fresh = deferred<string>();
    render(<Probe cacheKey="ho-wallet" fetcher={() => fresh.promise} options={{ persist: true }} />);
    expect(await screen.findByText('saved wallet')).toBeTruthy();

    await act(async () => fresh.resolve('fresh wallet'));

    expect(await screen.findByText('fresh wallet')).toBeTruthy();
    expect(screen.getByText('savedOnly:false')).toBeTruthy();
  });

  it('stays false for data that came from this session, even when a refresh then fails', async () => {
    const first = render(
      <Probe cacheKey="ho-wallet" fetcher={() => Promise.resolve('session wallet')} options={{ persist: true }} />,
    );
    expect(await screen.findByText('session wallet')).toBeTruthy();
    first.unmount();

    render(
      <Probe
        cacheKey="ho-wallet"
        fetcher={() => Promise.reject(new Error('Network request failed'))}
        options={{ persist: true }}
      />,
    );

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('session wallet')).toBeTruthy();
    expect(screen.getByText('stale:true')).toBeTruthy();
    expect(screen.getByText('savedOnly:false')).toBeTruthy();
  });
});

describe('without persist', () => {
  it('shows the loading state until the first fetch lands, as before, and touches no storage', async () => {
    await seed('ho-jobs', 'saved jobs');
    jest.clearAllMocks();
    const fresh = deferred<string>();
    render(<Probe cacheKey="ho-jobs" fetcher={() => fresh.promise} />);

    expect(screen.getByText('loading:true')).toBeTruthy();
    expect(screen.getByText('nothing yet')).toBeTruthy();
    expect(screen.getByText('refreshing:false')).toBeTruthy();
    expect(screen.queryByText('saved jobs')).toBeNull();

    await act(async () => fresh.resolve('fresh jobs'));

    expect(await screen.findByText('fresh jobs')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
    expect(screen.getByText('stale:false')).toBeTruthy();
    expect(readSaved).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('a refresh shows the data already on screen, marked as refreshing until it lands', async () => {
    const first = render(<Probe cacheKey="ho-jobs" fetcher={() => Promise.resolve('first jobs')} />);
    expect(await screen.findByText('first jobs')).toBeTruthy();
    first.unmount();
    const second = deferred<string>();

    render(<Probe cacheKey="ho-jobs" fetcher={() => second.promise} />);

    expect(screen.getByText('first jobs')).toBeTruthy();
    expect(screen.getByText('loading:false')).toBeTruthy();
    expect(screen.getByText('refreshing:true')).toBeTruthy();

    await act(async () => second.resolve('second jobs'));

    expect(await screen.findByText('second jobs')).toBeTruthy();
    expect(screen.getByText('refreshing:false')).toBeTruthy();
  });

  it('a failed refresh keeps what is on screen, flags it stale, and reports the error', async () => {
    const first = render(<Probe cacheKey="ho-jobs" fetcher={() => Promise.resolve('first jobs')} />);
    expect(await screen.findByText('first jobs')).toBeTruthy();
    first.unmount();

    render(
      <Probe cacheKey="ho-jobs" fetcher={() => Promise.reject(new Error('Network request failed'))} />,
    );

    expect(await screen.findByText('error:Network request failed')).toBeTruthy();
    expect(screen.getByText('first jobs')).toBeTruthy();
    expect(screen.getByText('stale:true')).toBeTruthy();
    expect(screen.getByText('refreshing:false')).toBeTruthy();
  });
});

describe('with a validator for the saved copy', () => {
  const isText = (value: unknown) => typeof value === 'string';
  const neverFetches = () => new Promise<string>(() => {});

  it('a saved copy the validator rejects is never shown, is removed, and the screen loads as with nothing saved', async () => {
    await seed('ho-jobs', { not: 'a string' });
    render(<Probe cacheKey="ho-jobs" fetcher={neverFetches} options={{ persist: true, validate: isText }} />);

    await settle();

    expect(screen.getByText('nothing yet')).toBeTruthy();
    expect(screen.getByText('loading:true')).toBeTruthy();
    expect(screen.getByText('stale:false')).toBeTruthy();
    expect(screen.getByText('savedOnly:false')).toBeTruthy();
    expect(await AsyncStorage.getItem(`taskbuddy.cache.v1.${ACCOUNT}.ho-jobs`)).toBeNull();
  });

  it('a saved copy the validator accepts is shown at once, as before', async () => {
    await seed('ho-jobs', 'saved jobs');
    render(<Probe cacheKey="ho-jobs" fetcher={neverFetches} options={{ persist: true, validate: isText }} />);

    expect(await screen.findByText('saved jobs')).toBeTruthy();
    expect(screen.getByText('savedOnly:true')).toBeTruthy();
  });
});
