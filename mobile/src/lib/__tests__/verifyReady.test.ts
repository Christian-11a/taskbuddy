import { missingProfileSteps, profileReadyToVerify } from '../verifyReady';

const WITH_ADDRESS = { address: 'Arturo Tanco Drive, Lipa' };
const WITH_BIO = { bio: 'Plumber for eight years' };

describe('profileReadyToVerify', () => {
  it('is ready when there is a service profile, an address and a bio', () => {
    expect(profileReadyToVerify(WITH_ADDRESS, WITH_BIO)).toBe(true);
  });

  it('is not ready without a service profile, even with an address', () => {
    expect(profileReadyToVerify(WITH_ADDRESS, null)).toBe(false);
    expect(profileReadyToVerify(WITH_ADDRESS, undefined)).toBe(false);
  });

  it('is not ready without an address, even with a bio', () => {
    expect(profileReadyToVerify(null, WITH_BIO)).toBe(false);
    expect(profileReadyToVerify({ address: null }, WITH_BIO)).toBe(false);
  });

  it('is not ready with neither an address nor a bio', () => {
    expect(profileReadyToVerify(null, null)).toBe(false);
  });

  it.each(['', '   ', '\n\t'])('treats the address %p as missing', (address) => {
    expect(profileReadyToVerify({ address }, WITH_BIO)).toBe(false);
  });

  it.each(['', '   ', '\n\t'])('treats the bio %p as missing', (bio) => {
    expect(profileReadyToVerify(WITH_ADDRESS, { bio })).toBe(false);
  });

  it('is not ready when the bio is null', () => {
    expect(profileReadyToVerify(WITH_ADDRESS, { bio: null })).toBe(false);
  });

  it('counts an address or bio with surrounding spaces as filled', () => {
    expect(profileReadyToVerify({ address: '  Lipa  ' }, { bio: '  Plumber  ' })).toBe(true);
  });

  it('counts a city alone as the address, the same rule as the Home setup card', () => {
    expect(profileReadyToVerify({ address: null, city: 'Lipa' }, WITH_BIO)).toBe(true);
    expect(profileReadyToVerify({ address: '  ', city: 'Lipa' }, WITH_BIO)).toBe(true);
    expect(profileReadyToVerify({ address: null, city: '  ' }, WITH_BIO)).toBe(false);
  });
});

describe('missingProfileSteps', () => {
  it('lists nothing when the address and bio are both saved', () => {
    expect(missingProfileSteps(WITH_ADDRESS, WITH_BIO)).toEqual([]);
    expect(missingProfileSteps({ address: null, city: 'Lipa' }, WITH_BIO)).toEqual([]);
  });

  it('lists the address when only the address is missing', () => {
    expect(missingProfileSteps(null, WITH_BIO)).toEqual(['address']);
    expect(missingProfileSteps({ address: '  ' }, WITH_BIO)).toEqual(['address']);
  });

  it('lists the bio when only the bio is missing', () => {
    expect(missingProfileSteps(WITH_ADDRESS, { bio: '' })).toEqual(['bio']);
    expect(missingProfileSteps(WITH_ADDRESS, null)).toEqual(['bio']);
  });

  it('lists the address first, then the bio, when both are missing', () => {
    expect(missingProfileSteps(null, null)).toEqual(['address', 'bio']);
    expect(missingProfileSteps({ address: ' ' }, { bio: ' ' })).toEqual(['address', 'bio']);
  });
});
