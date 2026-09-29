import {
  DEFAULT_MOBILE_API_VERSION,
  resolveMobileApiVersion,
} from './stripe-api-version';

describe('resolveMobileApiVersion', () => {
  it('defaults to the full acacia version', () => {
    expect(DEFAULT_MOBILE_API_VERSION).toBe('2025-01-27.acacia');
  });

  it.each([undefined, '', '   '])(
    'uses the default, silently, for %p',
    (raw) => {
      const warn = jest.fn();
      expect(resolveMobileApiVersion(raw, warn)).toBe(
        DEFAULT_MOBILE_API_VERSION,
      );
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.each(['2025-21-27', '2025-01-32', '2025-00-10', 'garbage', '2025-1-27'])(
    'rejects malformed %p, warns once naming it, and uses the default',
    (raw) => {
      const warn = jest.fn();
      expect(resolveMobileApiVersion(raw, warn)).toBe(
        DEFAULT_MOBILE_API_VERSION,
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(raw);
    },
  );

  it.each(['2025-01-27', '2025-01-27.acacia', '2024-06-20'])(
    'accepts well-formed %p unchanged',
    (raw) => {
      const warn = jest.fn();
      expect(resolveMobileApiVersion(raw, warn)).toBe(raw);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('trims surrounding whitespace', () => {
    expect(resolveMobileApiVersion(' 2025-01-27.acacia ')).toBe(
      '2025-01-27.acacia',
    );
  });
});
