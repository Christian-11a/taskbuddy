import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_HIRE_PAYMENT_TTL_MS,
  PENDING_HIRE_PAYMENTS_KEY,
  clearPendingHirePayment,
  getPendingHirePayment,
  isPendingHirePaymentExpired,
  loadPendingHirePayments,
  markPendingHirePayment,
  parsePendingHirePayments,
  resetPendingHirePaymentsForTests,
} from '../pendingHirePayments';

const NOW = Date.parse('2026-10-11T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** What the device holds, as parsed JSON, or null when nothing is stored. */
async function storedWaits(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(PENDING_HIRE_PAYMENTS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  await resetPendingHirePaymentsForTests();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pending hire payments: what the device remembers', () => {
  it('uses the agreed storage key and a 24-hour limit', () => {
    expect(PENDING_HIRE_PAYMENTS_KEY).toBe('hire.pendingPayments');
    expect(PENDING_HIRE_PAYMENT_TTL_MS).toBe(24 * HOUR);
  });

  it('a marked wait is readable at once, and is stored on the device with its start time', async () => {
    await markPendingHirePayment('app-1', false);

    expect(getPendingHirePayment('app-1')).toEqual({ returnedPaid: false, startedAt: NOW });
    expect(await storedWaits()).toEqual({ 'app-1': { returnedPaid: false, startedAt: NOW } });
  });

  it('marking again updates whether the browser reported a payment, but keeps when the checkout started', async () => {
    await markPendingHirePayment('app-1', false);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 5 * 60 * 1000);

    await markPendingHirePayment('app-1', true);

    expect(getPendingHirePayment('app-1')).toEqual({ returnedPaid: true, startedAt: NOW });
    expect(await storedWaits()).toEqual({ 'app-1': { returnedPaid: true, startedAt: NOW } });
  });

  it('clearing a wait forgets it here and on the device', async () => {
    await markPendingHirePayment('app-1', true);

    await clearPendingHirePayment('app-1');

    expect(getPendingHirePayment('app-1')).toBeNull();
    expect(await storedWaits()).toEqual({});
  });

  it('clearing a proposal with no wait is not an error, and leaves the other waits alone', async () => {
    await markPendingHirePayment('app-2', false);

    await expect(clearPendingHirePayment('app-1')).resolves.toBeUndefined();

    expect(getPendingHirePayment('app-2')).toEqual({ returnedPaid: false, startedAt: NOW });
    expect(await storedWaits()).toEqual({ 'app-2': { returnedPaid: false, startedAt: NOW } });
  });

  it('a mark followed by a clear ends with nothing stored, even when the writes overlap', async () => {
    void markPendingHirePayment('app-1', false);
    await clearPendingHirePayment('app-1');

    expect(await storedWaits()).toEqual({});
  });
});

describe('pending hire payments: a wait survives a restart', () => {
  it('after a restart, loading brings back the waits the device stored', async () => {
    await markPendingHirePayment('app-1', true);
    await resetPendingHirePaymentsForTests();
    expect(getPendingHirePayment('app-1')).toBeNull();

    const waits = await loadPendingHirePayments();

    expect(waits.get('app-1')).toEqual({ returnedPaid: true, startedAt: NOW });
    expect(getPendingHirePayment('app-1')).toEqual({ returnedPaid: true, startedAt: NOW });
  });

  it('a wait cleared while a load is still queued is not brought back by the copy the load reads', async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-1': { returnedPaid: false, startedAt: NOW } }),
    );

    const loading = loadPendingHirePayments();
    const clearing = clearPendingHirePayment('app-1');

    expect((await loading).has('app-1')).toBe(false);
    await clearing;
    expect(getPendingHirePayment('app-1')).toBeNull();
    expect(await storedWaits()).toEqual({});
  });

  it('a wait marked while a load is still queued is not overwritten by the older copy the load reads', async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-1': { returnedPaid: true, startedAt: NOW - HOUR } }),
    );

    const loading = loadPendingHirePayments();
    await markPendingHirePayment('app-1', false);

    expect((await loading).get('app-1')).toEqual({ returnedPaid: false, startedAt: NOW });
    expect(await storedWaits()).toEqual({ 'app-1': { returnedPaid: false, startedAt: NOW } });
  });
});

describe('pending hire payments: a wait older than 24 hours is forgotten', () => {
  it('a wait exactly 24 hours old is still kept, and one a millisecond older is expired', () => {
    expect(
      isPendingHirePaymentExpired({ returnedPaid: false, startedAt: NOW - PENDING_HIRE_PAYMENT_TTL_MS }, NOW),
    ).toBe(false);
    expect(
      isPendingHirePaymentExpired({ returnedPaid: false, startedAt: NOW - PENDING_HIRE_PAYMENT_TTL_MS - 1 }, NOW),
    ).toBe(true);
  });

  it('an expired wait on the device is dropped on load, and the device copy is cleaned up', async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({
        'app-old': { returnedPaid: false, startedAt: NOW - PENDING_HIRE_PAYMENT_TTL_MS - 1 },
        'app-new': { returnedPaid: true, startedAt: NOW - HOUR },
      }),
    );

    const waits = await loadPendingHirePayments();

    expect([...waits.keys()]).toEqual(['app-new']);
    expect(getPendingHirePayment('app-old')).toBeNull();
    expect(await storedWaits()).toEqual({ 'app-new': { returnedPaid: true, startedAt: NOW - HOUR } });
  });

  it('a wait that runs out while the app is open is dropped on the next read, and from the device', async () => {
    await markPendingHirePayment('app-1', false);
    jest.spyOn(Date, 'now').mockReturnValue(NOW + PENDING_HIRE_PAYMENT_TTL_MS + 1);

    expect(getPendingHirePayment('app-1')).toBeNull();

    await loadPendingHirePayments();
    expect(await storedWaits()).toEqual({});
  });

  it('marking a proposal again after its old wait has expired starts a new 24 hours', async () => {
    await markPendingHirePayment('app-1', false);
    const later = NOW + PENDING_HIRE_PAYMENT_TTL_MS + HOUR;
    jest.spyOn(Date, 'now').mockReturnValue(later);

    await markPendingHirePayment('app-1', true);

    expect(getPendingHirePayment('app-1')).toEqual({ returnedPaid: true, startedAt: later });
  });
});

describe('pending hire payments: unreadable storage', () => {
  it.each([[null], [''], ['null'], ['42'], ['"text"'], ['[1,2]'], ['{"app-1": {']])(
    'stored text %j is read as no waits, without throwing',
    (raw) => {
      expect(parsePendingHirePayments(raw, NOW).size).toBe(0);
    },
  );

  it('corrupt stored text is ignored, and the device copy is rewritten as valid JSON', async () => {
    await AsyncStorage.setItem(PENDING_HIRE_PAYMENTS_KEY, '{"app-1": {');

    expect((await loadPendingHirePayments()).size).toBe(0);
    expect(await storedWaits()).toEqual({});

    await markPendingHirePayment('app-2', false);
    expect(await storedWaits()).toEqual({ 'app-2': { returnedPaid: false, startedAt: NOW } });
  });

  it('entries of the wrong shape are skipped one by one, and the valid ones are kept', () => {
    const raw = JSON.stringify({
      'app-1': { returnedPaid: 'yes', startedAt: NOW },
      'app-2': { returnedPaid: true, startedAt: 'today' },
      'app-3': null,
      'app-4': { returnedPaid: false, startedAt: NOW },
    });

    expect([...parsePendingHirePayments(raw, NOW).keys()]).toEqual(['app-4']);
  });

  it('when storage cannot be read, the waits this session already knows still stand', async () => {
    await markPendingHirePayment('app-1', false);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(loadPendingHirePayments()).resolves.toEqual(
      new Map([['app-1', { returnedPaid: false, startedAt: NOW }]]),
    );
    expect(getPendingHirePayment('app-1')).toEqual({ returnedPaid: false, startedAt: NOW });
  });

  it('when storage cannot be written, marking still works for this session', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

    await expect(markPendingHirePayment('app-1', true)).resolves.toBeUndefined();

    expect(getPendingHirePayment('app-1')).toEqual({ returnedPaid: true, startedAt: NOW });
  });

  it('when storage cannot be written, clearing still works for this session', async () => {
    await markPendingHirePayment('app-1', true);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

    await expect(clearPendingHirePayment('app-1')).resolves.toBeUndefined();

    expect(getPendingHirePayment('app-1')).toBeNull();
  });
});
