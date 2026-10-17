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

  it('keeps the verification step last', () => {
    expect(providerSetupSteps(null, null, 'none').map((step) => step.id)).toEqual(['address', 'bio', 'verify', 'payout']);
  });

  it('describes the verification step from the request status', () => {
    expect(providerSetupSteps(null, null, 'none')[2]).toMatchObject({
      title: 'Get verified', subtitle: 'ID photo + selfie · about 2 minutes', actionLabel: 'Get verified',
    });
    expect(providerSetupSteps(null, null, 'pending')[2]).toMatchObject({ subtitle: 'Under review', actionLabel: 'View status' });
    expect(providerSetupSteps(null, null, 'rejected')[2]).toMatchObject({ actionLabel: 'Try again' });
  });

  it('marks verification done only once the provider is verified', () => {
    const steps = providerSetupSteps({ address: 'Lipa' }, { bio: 'Plumber', is_verified: true }, 'none');
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'next']);
  });
});

describe('payout account step', () => {
  const verified = { bio: 'Plumber', is_verified: true };

  it('comes after verification and is the next step once verified with no account', () => {
    const steps = providerSetupSteps({ address: 'Lipa' }, verified, 'none', false);
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
    const steps = providerSetupSteps({ address: 'Lipa' }, { bio: 'Plumber', is_verified: true }, 'none', true);
    expect(nextSetupStep(steps)).toBeUndefined();
    expect(setupProgress(steps)).toEqual({ done: 4, total: 4 });
  });
});
