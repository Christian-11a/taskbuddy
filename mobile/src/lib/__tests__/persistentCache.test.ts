import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NEVER_PERSIST,
  clearLastAccountPersisted,
  clearPersisted,
  getCacheAccount,
  isPersistable,
  readPersisted,
  setCacheAccount,
  writePersisted,
} from '../persistentCache';

const KB = 1024;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = Date.parse('2026-10-12T09:00:00.000Z');
const ALICE = 'acct-alice';
const BOB = 'acct-bob';

const entryKey = (account: string, key: string) => `taskbuddy.cache.v1.${account}.${key}`;
const indexKey = (account: string) => `taskbuddy.cache.v1.index.${account}`;

/** Every key this module has written, whichever account owns it. */
async function cacheKeys(): Promise<string[]> {
  return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('taskbuddy.cache.v1.'));
}

/** The clock the module sees. Move it between saves to keep their order obvious. */
let clock = START;
let dateSpy: jest.SpyInstance | undefined;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  clock = START;
  dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  setCacheAccount(ALICE);
});

afterEach(() => {
  dateSpy?.mockRestore();
  dateSpy = undefined;
  setCacheAccount(null);
});

describe('which keys may be saved', () => {
  it.each(['ho-jobs', 'sp-applications', 'ho-home-categories', 'sp-assigned'])(
    '%s may be saved',
    (key) => {
      expect(isPersistable(key)).toBe(true);
    },
  );

  it.each([
    ['payment-methods'],
    ['Payments'],
    ['hire.pendingPayments'],
    ['hire-checkout'],
    ['Hire-Checkout'],
    ['checkout'],
    ['withdraw'],
    ['ho-withdrawals'],
    ['HO-WITHDRAWALS'],
    ['sp-payment-status'],
    ['ho-checkout'],
    ['chat-thread-1'],
    ['token-refresh'],
    ['auth-me'],
    ['session'],
    ['verification-upload-2'],
  ])('%s is never saved', (key) => {
    expect(isPersistable(key)).toBe(false);
  });

  it('an empty key is never saved', () => {
    expect(isPersistable('')).toBe(false);
  });

  it('lists the prefixes that are never saved', () => {
    expect(NEVER_PERSIST).toEqual(
      expect.arrayContaining([
        'payment',
        'hire',
        'checkout',
        'withdraw',
        'chat',
        'token',
        'auth',
        'session',
        'verification-upload',
      ]),
    );
  });
});

describe('saving and reading back', () => {
  it('returns the saved value with the time it was saved', async () => {
    await writePersisted('ho-jobs', [{ id: 'j1', title: 'Fix the sink' }]);

    expect(await readPersisted('ho-jobs')).toEqual({
      value: [{ id: 'j1', title: 'Fix the sink' }],
      savedAt: START,
    });
  });

  it('stores a versioned envelope under the account and the key', async () => {
    await writePersisted('ho-jobs', { count: 2 });

    const raw = await AsyncStorage.getItem(entryKey(ALICE, 'ho-jobs'));
    expect(JSON.parse(raw as string)).toEqual({ v: 1, savedAt: START, value: { count: 2 } });
  });

  it('keeps the most recent save', async () => {
    await writePersisted('ho-jobs', ['old']);
    clock += 1000;
    await writePersisted('ho-jobs', ['new']);

    expect(await readPersisted('ho-jobs')).toEqual({ value: ['new'], savedAt: START + 1000 });
  });

  it.each([[0], [false], [''], [null], [[]]])('keeps the falsy value %j', async (value) => {
    await writePersisted('ho-jobs', value);

    expect(await readPersisted('ho-jobs')).toEqual({ value, savedAt: START });
  });

  it('saves the value as it was when handed over, even if the caller changes it afterwards', async () => {
    const jobs = [{ id: 'j1' }];
    const pending = writePersisted('ho-jobs', jobs);
    jobs[0].id = 'changed';
    await pending;

    expect(await readPersisted('ho-jobs')).toEqual({ value: [{ id: 'j1' }], savedAt: START });
  });

  it('a key that was never saved reads as nothing saved', async () => {
    expect(await readPersisted('ho-jobs')).toBeNull();
  });
});

describe('how old a saved value may be', () => {
  it.each([
    [0, true],
    [DAY, true],
    [DAY + 1, false],
  ])('after %i ms the saved value is returned: %s', async (ageMs, returned) => {
    await writePersisted('ho-jobs', ['x']);
    clock = START + ageMs;

    expect((await readPersisted('ho-jobs')) !== null).toBe(returned);
  });

  it('honours a shorter limit passed by the caller', async () => {
    await writePersisted('ho-jobs', ['x']);
    clock = START + 2 * HOUR;

    expect(await readPersisted('ho-jobs', { maxAgeMs: HOUR })).toBeNull();
    expect(await readPersisted('ho-jobs', { maxAgeMs: 3 * HOUR })).not.toBeNull();
  });

  it('does not trust a save dated after now, such as after the clock was moved back', async () => {
    await writePersisted('ho-jobs', ['x']);
    clock = START - 1;

    expect(await readPersisted('ho-jobs')).toBeNull();
  });
});

describe('what counts as a saved value', () => {
  it.each([
    ['another schema version', JSON.stringify({ v: 2, savedAt: START, value: ['x'] })],
    ['no version', JSON.stringify({ savedAt: START, value: ['x'] })],
    ['no saved time', JSON.stringify({ v: 1, value: ['x'] })],
    ['a saved time that is not a number', JSON.stringify({ v: 1, savedAt: 'today', value: ['x'] })],
    ['no value', JSON.stringify({ v: 1, savedAt: START })],
    ['a bare value with no envelope', JSON.stringify(['x'])],
    ['corrupt JSON', '{"v":1,"savedAt":'],
    ['the text null', 'null'],
  ])('%s is read as nothing saved', async (_label, raw) => {
    await AsyncStorage.setItem(entryKey(ALICE, 'ho-jobs'), raw);

    await expect(readPersisted('ho-jobs')).resolves.toBeNull();
  });
});

describe('size limits', () => {
  it('saves a value whose JSON is exactly 200 KB', async () => {
    const value = 'x'.repeat(200 * KB - 2); // JSON adds the two quotes

    await writePersisted('ho-jobs', value);

    expect(await readPersisted('ho-jobs')).toEqual({ value, savedAt: START });
  });

  it('skips a value one byte over 200 KB, without an error or an index line', async () => {
    await expect(writePersisted('ho-jobs', 'x'.repeat(200 * KB - 1))).resolves.toBeUndefined();

    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(await AsyncStorage.getItem(entryKey(ALICE, 'ho-jobs'))).toBeNull();
    expect(await AsyncStorage.getItem(indexKey(ALICE))).toBeNull();
  });

  it('measures the size in UTF-8 bytes, so symbols that take three bytes count for more', async () => {
    // Each euro sign is one character here but three bytes once stored.
    await writePersisted('ho-jobs', '€'.repeat(70 * KB));

    expect(await readPersisted('ho-jobs')).toBeNull();
  });

  it('drops an older copy of the same key when the new value is too large to keep', async () => {
    await writePersisted('ho-jobs', ['small']);

    await writePersisted('ho-jobs', 'x'.repeat(200 * KB));

    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(await AsyncStorage.getItem(entryKey(ALICE, 'ho-jobs'))).toBeNull();
  });
});

describe('the cap on one account', () => {
  // A 100 KB JSON string. Its saved envelope is 40 bytes longer, so 15 fit under 1.5 MB.
  const chunk = 'x'.repeat(100 * KB - 2);

  it('keeps an index of each saved key with its size and the time it was saved', async () => {
    await writePersisted('ho-jobs', ['a']);
    clock += 5;
    await writePersisted('ho-wallet', { balance: 10 });

    const index = JSON.parse((await AsyncStorage.getItem(indexKey(ALICE))) as string);
    const stored = (await AsyncStorage.getItem(entryKey(ALICE, 'ho-jobs'))) as string;
    expect(index).toEqual([
      { key: 'ho-jobs', bytes: stored.length, savedAt: START },
      { key: 'ho-wallet', bytes: expect.any(Number), savedAt: START + 5 },
    ]);
  });

  it('drops the oldest copies first once the account would pass about 1.5 MB', async () => {
    for (let i = 0; i < 16; i++) {
      clock += 1;
      await writePersisted(`list-${i}`, chunk);
    }

    expect(await readPersisted('list-0')).toBeNull();
    expect(await AsyncStorage.getItem(entryKey(ALICE, 'list-0'))).toBeNull();
    for (let i = 1; i < 16; i++) {
      expect(await readPersisted(`list-${i}`)).not.toBeNull();
    }
    const index: Array<{ bytes: number }> = JSON.parse(
      (await AsyncStorage.getItem(indexKey(ALICE))) as string,
    );
    expect(index.reduce((sum, entry) => sum + entry.bytes, 0)).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });

  it('re-saving a key replaces its size instead of adding to it', async () => {
    for (let i = 0; i < 15; i++) {
      await writePersisted(`list-${i}`, chunk);
    }
    clock += 1;

    await writePersisted('list-3', chunk);

    for (let i = 0; i < 15; i++) {
      expect(await readPersisted(`list-${i}`)).not.toBeNull();
    }
  });
});

describe('what is never written', () => {
  it.each(['ho-withdrawals', 'hire-checkout', 'payment-methods'])(
    '%s is not written even when a caller asks',
    async (key) => {
      // The account set in beforeEach records itself on the device first. That write is not one for this key.
      await new Promise((resolve) => setTimeout(resolve, 0));
      jest.mocked(AsyncStorage.setItem).mockClear();
      await expect(writePersisted(key, ['x'])).resolves.toBeUndefined();

      expect(await AsyncStorage.getItem(entryKey(ALICE, key))).toBeNull();
      expect(await readPersisted(key)).toBeNull();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    },
  );
});

describe('with no account set', () => {
  it('writes nothing and reads nothing', async () => {
    await AsyncStorage.setItem(
      entryKey(ALICE, 'ho-jobs'),
      JSON.stringify({ v: 1, savedAt: START, value: ['x'] }),
    );
    jest.clearAllMocks();
    setCacheAccount(null);

    await writePersisted('ho-wallet', { balance: 1 });

    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('an empty account id counts as no account', () => {
    setCacheAccount('');

    expect(getCacheAccount()).toBeNull();
  });

  it('reports the account that is set', () => {
    expect(getCacheAccount()).toBe(ALICE);
  });
});

describe('clearing an account', () => {
  it("removes that account's saved values and index, and leaves other accounts alone", async () => {
    await writePersisted('ho-jobs', ['alice']);
    await writePersisted('ho-wallet', { balance: 1 });
    setCacheAccount(BOB);
    await writePersisted('ho-jobs', ['bob']);
    setCacheAccount(ALICE);

    await clearPersisted(ALICE);

    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(await readPersisted('ho-wallet')).toBeNull();
    expect(await AsyncStorage.getItem(indexKey(ALICE))).toBeNull();
    setCacheAccount(BOB);
    expect(await readPersisted('ho-jobs')).toEqual({ value: ['bob'], savedAt: START });
  });

  it('still removes every copy when the index has been lost', async () => {
    await writePersisted('ho-jobs', ['alice']);
    await AsyncStorage.removeItem(indexKey(ALICE));

    await clearPersisted(ALICE);

    expect(await cacheKeys()).toEqual([]);
  });

  it('waits for a save already on its way, so that save cannot come back after the clear', async () => {
    void writePersisted('ho-jobs', ['alice']);

    await clearPersisted(ALICE);

    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(await cacheKeys()).toEqual([]);
  });

  it('with nothing saved, and with an empty id, is not an error', async () => {
    await expect(clearPersisted(ALICE)).resolves.toBeUndefined();
    await expect(clearPersisted('')).resolves.toBeUndefined();
  });

  it('does not throw when storage cannot list or remove keys', async () => {
    await writePersisted('ho-jobs', ['alice']);
    jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('disk'));
    jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(new Error('disk'));

    await expect(clearPersisted(ALICE)).resolves.toBeUndefined();
  });
});

describe('when storage fails', () => {
  it('a failed read reads as nothing saved', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(readPersisted('ho-jobs')).resolves.toBeNull();
  });

  it('a failed save resolves, and leaves no index line for a copy that was never stored', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(writePersisted('ho-jobs', ['x'])).resolves.toBeUndefined();

    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(await AsyncStorage.getItem(indexKey(ALICE))).toBeNull();
  });

  it('a value that cannot be turned into JSON is skipped without throwing', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(writePersisted('ho-jobs', circular)).resolves.toBeUndefined();

    expect(await readPersisted('ho-jobs')).toBeNull();
  });

  it('a value with no JSON form (undefined) is skipped', async () => {
    await expect(writePersisted('ho-jobs', undefined)).resolves.toBeUndefined();

    expect(await cacheKeys()).toEqual([]);
  });
});

describe('a saved copy the caller rejects as the wrong shape', () => {
  const isList = (value: unknown) => Array.isArray(value);

  it('is not returned, and is removed from the device along with its index line', async () => {
    await writePersisted('ho-jobs', {});
    await writePersisted('ho-wallet', { balance: 1 });

    expect(await readPersisted('ho-jobs', { validate: isList })).toBeNull();

    expect(await AsyncStorage.getItem(entryKey(ALICE, 'ho-jobs'))).toBeNull();
    const index = JSON.parse((await AsyncStorage.getItem(indexKey(ALICE))) ?? '[]') as Array<{ key: string }>;
    expect(index.map((entry) => entry.key)).toEqual(['ho-wallet']);
    expect(await readPersisted('ho-jobs')).toBeNull();
    expect(await readPersisted('ho-wallet')).not.toBeNull();
  });

  it('is returned as usual when the caller accepts its shape', async () => {
    await writePersisted('ho-jobs', ['x']);

    expect(await readPersisted('ho-jobs', { validate: isList })).toEqual({ value: ['x'], savedAt: START });
  });
});

describe('the account this device last had', () => {
  const LAST_ACCOUNT = 'taskbuddy.cache.lastAccount';

  /** Lets the queued storage writes land. */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('is recorded when an account is set, so a launch with no session can still find its copies', async () => {
    setCacheAccount(BOB);
    await flush();

    expect(await AsyncStorage.getItem(LAST_ACCOUNT)).toBe(BOB);
  });

  it('lets a launch with no account in memory clear the copies of the account it last had, and the record too', async () => {
    await writePersisted('ho-jobs', ['alice job']);
    await flush();
    setCacheAccount(null);

    await clearLastAccountPersisted();

    expect(await cacheKeys()).toEqual([]);
    expect(await AsyncStorage.getItem(LAST_ACCOUNT)).toBeNull();
  });

  it('is removed when its own account is cleared, and kept when some other account is cleared', async () => {
    await flush();
    expect(await AsyncStorage.getItem(LAST_ACCOUNT)).toBe(ALICE);

    await clearPersisted(BOB);
    expect(await AsyncStorage.getItem(LAST_ACCOUNT)).toBe(ALICE);

    await clearPersisted(ALICE);
    expect(await AsyncStorage.getItem(LAST_ACCOUNT)).toBeNull();
  });

  it('does nothing when no account was ever recorded', async () => {
    // The record written when the account was set in beforeEach must land first, or it would survive this clear.
    await flush();
    await AsyncStorage.clear();

    await expect(clearLastAccountPersisted()).resolves.toBeUndefined();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
