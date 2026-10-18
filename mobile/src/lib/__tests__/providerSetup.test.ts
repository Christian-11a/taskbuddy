import { nextSetupStep, providerSetupSteps, setupProgress } from '../providerSetup';

describe('providerSetupSteps', () => {
  it('marks the address done from the street address, or from the city alone', () => {
    const withAddress = providerSetupSteps({ address: 'Arturo Tanco Drive, Lipa', city: 'Lipa' }, null, 'none');
    expect(withAddress[0]).toMatchObject({ id: 'address', done: true, state: 'done', subtitle: 'Arturo Tanco Drive, Lipa' });

    const cityOnly = providerSetupSteps({ address: '  ', city: 'Lipa' }, null, 'none');
    expect(cityOnly[0]).toMatchObject({ done: true, subtitle: 'Lipa' });

    const empty = providerSetupSteps({ address: null, city: null }, null, 'none');
    expect(empty[0]).toMatchObject({
      done: false,
      state: 'next',
      subtitle: 'House number and street, used to show jobs near you',
    });
  });

  it('marks the bio done only when it has text', () => {
    const addressSaved = { address: 'Lipa' };
    expect(providerSetupSteps(addressSaved, { bio: '   ' }, 'none')[1]).toMatchObject({ id: 'bio', done: false, state: 'next' });
    expect(providerSetupSteps(addressSaved, { bio: 'Plumber for eight years' }, 'none')[1])
      .toMatchObject({ done: true, state: 'done', subtitle: 'Plumber for eight years' });
  });

  it('makes the first undone step next and the steps after it locked', () => {
    expect(providerSetupSteps({ address: 'Lipa' }, null, 'none').map((step) => step.state)).toEqual(['done', 'next', 'locked', 'locked']);
    expect(providerSetupSteps(null, null, 'none').map((step) => step.state)).toEqual(['next', 'locked', 'locked', 'locked']);
  });

  it('keeps Get verified third and the payout account last', () => {
    expect(providerSetupSteps(null, null, 'none').map((step) => step.id)).toEqual(['address', 'bio', 'verify', 'payout']);
  });

  it('describes the Get verified step from the request status', () => {
    expect(providerSetupSteps(null, null, 'none')[2]).toMatchObject({
      title: 'Get verified',
      subtitle: 'ID photo, selfie and certificate · about 5 minutes',
      actionLabel: 'Get verified',
      opensCertificate: false,
    });
    expect(providerSetupSteps(null, null, 'pending')[2]).toMatchObject({ subtitle: 'ID under review', actionLabel: 'View status', opensCertificate: false });
    expect(providerSetupSteps(null, null, 'rejected')[2]).toMatchObject({
      subtitle: 'Not accepted · upload new photos',
      actionLabel: 'Try again',
      opensCertificate: false,
    });
  });

  it('marks Get verified done only once the provider is verified', () => {
    const steps = providerSetupSteps({ address: 'Lipa' }, { bio: 'Plumber', is_verified: true }, 'none');
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'next']);
    expect(steps[2]).toMatchObject({ done: true, subtitle: 'Verified' });
  });
});

describe('the Get verified step', () => {
  const ready = { address: 'Lipa' };
  const bio = { bio: 'Plumber' };
  const verifyStep = (verifyState: 'none' | 'pending' | 'rejected', extras?: Parameters<typeof providerSetupSteps>[4]) =>
    providerSetupSteps(ready, bio, verifyState, null, extras)[2];

  it('is not done until the ID and the certificate are both approved', () => {
    expect(verifyStep('none', { identityApproved: true, certificate: 'approved' })).toMatchObject({ done: true, state: 'done' });
    expect(verifyStep('none', { identityApproved: true, certificate: 'pending' })).toMatchObject({ done: false });
    expect(verifyStep('none', { identityApproved: false, certificate: 'approved' })).toMatchObject({ done: false });
  });

  it('asks for the certificate once the ID is approved, and opens the certificate screen for it', () => {
    expect(verifyStep('none', { identityApproved: true, certificate: 'none' })).toMatchObject({
      done: false,
      state: 'next',
      subtitle: 'ID approved · certificate needed',
      actionLabel: 'Upload your certificate',
      opensCertificate: true,
    });
  });

  it('follows the certificate status once the ID is approved', () => {
    const at = (certificate: 'pending' | 'rejected' | 'expired') => verifyStep('none', { identityApproved: true, certificate });
    expect(at('pending')).toMatchObject({ subtitle: 'ID approved · certificate under review', actionLabel: 'View status', opensCertificate: true });
    expect(at('rejected')).toMatchObject({ subtitle: 'Certificate not accepted · upload a new one', actionLabel: 'Upload again', opensCertificate: true });
    expect(at('expired')).toMatchObject({ subtitle: 'Certificate expired · upload a renewed one', actionLabel: 'Renew certificate', opensCertificate: true });
  });

  it('keeps the ID check first: under review or not accepted, whatever the certificate says', () => {
    expect(verifyStep('pending', { certificate: 'approved' })).toMatchObject({ subtitle: 'ID under review', actionLabel: 'View status', opensCertificate: false });
    expect(verifyStep('rejected', { certificate: 'none' })).toMatchObject({
      subtitle: 'Not accepted · upload new photos',
      actionLabel: 'Try again',
      opensCertificate: false,
    });
  });

  it('takes the ID step from identityApproved when given', () => {
    const steps = providerSetupSteps(ready, { bio: 'Plumber', is_verified: false }, 'none', null, { identityApproved: true });
    expect(steps[2]).toMatchObject({ done: false, subtitle: 'ID approved · certificate needed' });
  });

  it('is done when the provider is verified, even before the certificate has loaded', () => {
    expect(providerSetupSteps(ready, { bio: 'Plumber', is_verified: true }, 'none', null, { certificate: 'unknown' })[2])
      .toMatchObject({ done: true, subtitle: 'Verified' });
  });
});

describe('payout account step', () => {
  const verified = { bio: 'Plumber', is_verified: true };

  it('comes after verification and is the next step once verified with no account', () => {
    const steps = providerSetupSteps({ address: 'Lipa' }, verified, 'none', false, { certificate: 'approved' });
    expect(steps[3]).toMatchObject({ id: 'payout', title: 'Link payout account', done: false, state: 'next', actionLabel: 'Link payout account' });
    expect(nextSetupStep(steps)?.id).toBe('payout');
  });

  it('is done once an account is linked, and stays open while that is unknown', () => {
    expect(providerSetupSteps({ address: 'Lipa' }, verified, 'none', true)[3]).toMatchObject({ done: true, state: 'done', subtitle: 'Linked' });
    expect(providerSetupSteps({ address: 'Lipa' }, verified, 'none')[3].done).toBe(false);
  });

  it('stays locked until verification is done', () => {
    expect(providerSetupSteps({ address: 'Lipa' }, { bio: 'Plumber' }, 'none', false)[3].state).toBe('locked');
  });
});

describe('setupProgress and nextSetupStep', () => {
  it('counts the finished steps and names the next one', () => {
    const steps = providerSetupSteps({ address: 'Arturo Tanco Drive, Lipa' }, null, 'none');
    expect(setupProgress(steps)).toEqual({ done: 1, total: 4 });
    expect(nextSetupStep(steps)?.id).toBe('bio');
  });

  it('has no next step once everything is done', () => {
    const steps = providerSetupSteps({ address: 'Lipa' }, { bio: 'Plumber', is_verified: true }, 'none', true, { certificate: 'approved' });
    expect(nextSetupStep(steps)).toBeUndefined();
    expect(setupProgress(steps)).toEqual({ done: 4, total: 4 });
  });
});
