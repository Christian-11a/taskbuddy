import { isFeed, isHomeWallet, isList, isWallet } from '../savedShapes';

// A saved copy that is valid JSON but has the wrong shape must be rejected, or the screen that reads it can crash.

describe('isList', () => {
  it.each([
    ['accepts an empty list', [], true],
    ['accepts a list of jobs', [{ id: 'j1', title: 'Fix the sink' }], true],
    ['rejects an empty object, as a corrupt copy can be', {}, false],
    ['rejects a list wrapped in an object', { jobs: [] }, false],
    ['rejects a string', 'jobs', false],
    ['rejects null', null, false],
  ])('%s', (_name, value, expected) => {
    expect(isList(value)).toBe(expected);
  });
});

describe('isHomeWallet', () => {
  it.each([
    ['accepts a wallet with a numeric balance', { balance: 12.5 }, true],
    ['accepts a numeric balance of zero', { balance: 0, available: 'x' }, true],
    ['rejects a balance sent as text', { balance: '12.50' }, false],
    ['rejects a wallet with no balance', { available: 3 }, false],
    ['rejects an empty object', {}, false],
    ['rejects a list', [{ balance: 1 }], false],
    ['rejects null', null, false],
  ])('%s', (_name, value, expected) => {
    expect(isHomeWallet(value)).toBe(expected);
  });
});

describe('isWallet', () => {
  it.each([
    ['accepts a full wallet', { balance: 650, available: 300, transactions: [] }, true],
    ['rejects a wallet whose history is an object', { balance: 1, available: 1, transactions: {} }, false],
    ['rejects a wallet with no history', { balance: 1, available: 1 }, false],
    ['rejects an available amount that is not a number', { balance: 1, available: null, transactions: [] }, false],
    ['rejects a wallet with no balance', { available: 1, transactions: [] }, false],
    ['rejects an empty object', {}, false],
    ['rejects a list', [], false],
  ])('%s', (_name, value, expected) => {
    expect(isWallet(value)).toBe(expected);
  });
});

describe('isFeed', () => {
  it.each([
    [
      'accepts the provider feed as it is saved',
      { jobs: [], summary: { open_count: 0, urgent_count: 0, potential_payout: 0 }, assigned: [], loaded: 'all' },
      true,
    ],
    ['rejects a feed whose jobs are an object', { jobs: {}, assigned: [] }, false],
    ['rejects a feed with no assigned list', { jobs: [] }, false],
    ['rejects an empty object', {}, false],
    ['rejects a bare list of jobs', [], false],
  ])('%s', (_name, value, expected) => {
    expect(isFeed(value)).toBe(expected);
  });
});
