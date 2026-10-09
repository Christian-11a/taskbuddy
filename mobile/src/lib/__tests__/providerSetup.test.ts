import { nextSetupStep, providerSetupSteps, setupProgress } from '../providerSetup';

describe('providerSetupSteps', () => {
  it('marks the address done from the street address, or from the city alone', () => {
    const withAddress = providerSetupSteps({ address: 'Arturo Tanco Drive, Lipa', city: 'Lipa' }, null, 'none');
    expect(withAddress[0]).toMatchObject({ id: 'address', done: true, state: 'done', subtitle: 'Arturo Tanco Drive, Lipa' });

    const cityOnly = providerSetupSteps({ address: '  ', city: 'Lipa' }, null, 'none');
    expect(cityOnly[0]).toMatchObject({ done: true, subtitle: 'Lipa' });

    const empty = providerSetupSteps({ address: null, city: null }, null, 'none');
    expect(empty[0]).toMatchObject({ done: false, state: 'next', subtitle: 'Used to show jobs near you' });
  });

  it('marks the bio done only when it has text', () => {
    const addressSaved = { address: 'Lipa' };
    expect(providerSetupSteps(addressSaved, { bio: '   ' }, 'none')[1]).toMatchObject({ id: 'bio', done: false, state: 'next' });
    expect(providerSetupSteps(addressSaved, { bio: 'Plumber for eight years' }, 'none')[1])
      .toMatchObject({ done: true, state: 'done', subtitle: 'Plumber for eight years' });
  });

  it('makes the first undone step next and the steps after it locked', () => {
    expect(providerSetupSteps({ address: 'Lipa' }, null, 'none').map((step) => step.state)).toEqual(['done', 'next', 'locked']);
    expect(providerSetupSteps(null, null, 'none').map((step) => step.state)).toEqual(['next', 'locked', 'locked']);
  });

  it('keeps the verification step last', () => {
    expect(providerSetupSteps(null, null, 'none').map((step) => step.id)).toEqual(['address', 'bio', 'verify']);
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
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done']);
  });
});

describe('setupProgress and nextSetupStep', () => {
  it('counts the finished steps and names the next one', () => {
    const steps = providerSetupSteps({ address: 'Arturo Tanco Drive, Lipa' }, null, 'none');
    expect(setupProgress(steps)).toEqual({ done: 1, total: 3 });
    expect(nextSetupStep(steps)?.id).toBe('bio');
  });

  it('has no next step once everything is done', () => {
    const steps = providerSetupSteps({ address: 'Lipa' }, { bio: 'Plumber', is_verified: true }, 'none');
    expect(nextSetupStep(steps)).toBeUndefined();
    expect(setupProgress(steps)).toEqual({ done: 3, total: 3 });
  });
});
