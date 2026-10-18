import { challengeFor, newVerifier, parsePending, secretFromRedirect } from '../googleHandoff';

jest.mock('expo-crypto', () => {
  const { createHash, randomUUID } = jest.requireActual('crypto');
  return {
    randomUUID: () => randomUUID(),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: (_alg: string, data: string) =>
      Promise.resolve(createHash('sha256').update(data).digest('hex')),
  };
});

const SECRET = 's'.repeat(43);

describe('googleHandoff', () => {
  it('makes a long random verifier and its hex sha256 challenge', async () => {
    const verifier = newVerifier();
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(newVerifier()).not.toBe(verifier);
    await expect(challengeFor('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('reads the secret only from a redirect for this handoff', () => {
    const url = `taskbuddy://?handoff=h1&handoff_secret=${SECRET}`;
    expect(secretFromRedirect(url, 'h1')).toBe(SECRET);
    expect(secretFromRedirect(url, 'other')).toBeNull();
    expect(secretFromRedirect('taskbuddy://?handoff=h1', 'h1')).toBeNull();
    expect(secretFromRedirect('taskbuddy://?handoff=h1&handoff_secret=short', 'h1')).toBeNull();
    expect(secretFromRedirect(null, 'h1')).toBeNull();
  });

  it('accepts only the current pending shape', () => {
    expect(parsePending(JSON.stringify({ id: 'h1', verifier: 'v', startedAt: 1, secret: SECRET }))).toEqual({
      id: 'h1',
      verifier: 'v',
      startedAt: 1,
      secret: SECRET,
    });
    // Saved by a build before backend 0071: no verifier, cannot be claimed.
    expect(parsePending(JSON.stringify({ id: 'h1', startedAt: 1 }))).toBeNull();
    expect(parsePending('not json')).toBeNull();
    expect(parsePending(null)).toBeNull();
  });
});
