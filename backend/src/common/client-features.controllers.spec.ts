import { CredentialsController } from '../credentials/credentials.controller';
import { VerificationsController } from '../verifications/verifications.controller';
import type { CredentialsService } from '../credentials/credentials.service';
import type { VerificationsService } from '../verifications/verifications.service';
import type { Profile } from './types';

const provider = { id: 'p1', role: 'provider' } as Profile;

describe('X-Client-Features reaches the services', () => {
  it('GET /verifications/me: new app gets revoked, old app does not', async () => {
    const mine = jest.fn().mockResolvedValue({});
    const controller = new VerificationsController({
      mine,
    } as unknown as VerificationsService);
    await controller.mine(provider, 'revoked-status');
    await controller.mine(provider, undefined);
    expect(mine).toHaveBeenNthCalledWith(1, provider, true);
    expect(mine).toHaveBeenNthCalledWith(2, provider, false);
  });

  it('GET /providers/me/credentials: same', async () => {
    const mine = jest.fn().mockResolvedValue([]);
    const controller = new CredentialsController({
      mine,
    } as unknown as CredentialsService);
    await controller.mine(provider, 'other, revoked-status');
    await controller.mine(provider, '');
    expect(mine).toHaveBeenNthCalledWith(1, provider, true);
    expect(mine).toHaveBeenNthCalledWith(2, provider, false);
  });
});
