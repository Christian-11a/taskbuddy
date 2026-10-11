import { confirmRoleChoice, roleConfirmCopy } from '../roleConfirm';

describe('roleConfirmCopy', () => {
  it('asks a provider to confirm, naming the Google account', () => {
    expect(roleConfirmCopy('provider', 'ana@gmail.com')).toEqual({
      title: 'Sign up as a service provider?',
      body: "Your Google account ana@gmail.com will be set up for finding work. This can't be changed later.",
      confirmLabel: 'Yes, I want to work',
      chooseAgainLabel: 'Choose again',
    });
  });

  it('asks a client to confirm for hiring', () => {
    expect(roleConfirmCopy('homeowner', 'ana@gmail.com')).toMatchObject({
      title: 'Sign up as a client?',
      body: "Your Google account ana@gmail.com will be set up for hiring. This can't be changed later.",
      confirmLabel: 'Yes, I want to hire',
    });
  });

  it('leaves the account clause out when no Google email is known', () => {
    expect(roleConfirmCopy('provider', null).body)
      .toBe("Your Google account will be set up for finding work. This can't be changed later.");
    expect(roleConfirmCopy('homeowner', '   ').body)
      .toBe("Your Google account will be set up for hiring. This can't be changed later.");
  });
});

describe('confirmRoleChoice', () => {
  it('saves the homeowner role once and never moves on to the provider form', async () => {
    const saveHomeowner = jest.fn().mockResolvedValue(undefined);
    const continueToProvider = jest.fn();

    await confirmRoleChoice('homeowner', { saveHomeowner, continueToProvider });

    expect(saveHomeowner).toHaveBeenCalledTimes(1);
    expect(continueToProvider).not.toHaveBeenCalled();
  });

  it('continues to the provider details without saving anything', async () => {
    const saveHomeowner = jest.fn();
    const continueToProvider = jest.fn();

    await confirmRoleChoice('provider', { saveHomeowner, continueToProvider });

    expect(continueToProvider).toHaveBeenCalledTimes(1);
    expect(saveHomeowner).not.toHaveBeenCalled();
  });

  it('passes a failed homeowner save back to the caller', async () => {
    const saveHomeowner = jest.fn().mockRejectedValue(new Error('Network down'));

    await expect(
      confirmRoleChoice('homeowner', { saveHomeowner, continueToProvider: jest.fn() }),
    ).rejects.toThrow('Network down');
  });
});
