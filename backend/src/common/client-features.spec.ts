import { clientFeatures, knowsRevoked } from './client-features';
import { revokedAsRejected } from '../verifications/verifications.service';
import { asRejectedForOldApps } from '../credentials/credentials.service';

describe('client features', () => {
  it('reads a comma list, case and spaces ignored', () => {
    expect([...clientFeatures(' Revoked-Status , other ')]).toEqual([
      'revoked-status',
      'other',
    ]);
    expect(knowsRevoked('revoked-status')).toBe(true);
    expect(knowsRevoked(['x', 'revoked-status'])).toBe(true);
    expect(knowsRevoked(undefined)).toBe(false);
    expect(knowsRevoked('')).toBe(false);
  });
});

describe('older apps see revoked as rejected', () => {
  it('GET /verifications/me: status, identity, certificate and services', () => {
    const me = {
      id: 'v1',
      status: 'revoked',
      rejection_reason: null,
      revoke_reason: 'The ID photo was edited.',
      identity: 'revoked',
      certificate: 'revoked',
      verified: false,
      services: [
        { category_id: 1, certificate: 'revoked' },
        { category_id: 2, certificate: 'approved' },
      ],
    };
    expect(revokedAsRejected(me)).toEqual({
      ...me,
      status: 'rejected',
      rejection_reason: 'The ID photo was edited.',
      identity: 'rejected',
      certificate: 'rejected',
      services: [
        { category_id: 1, certificate: 'rejected' },
        { category_id: 2, certificate: 'approved' },
      ],
    });
  });

  it('leaves everything else as it is', () => {
    const me = {
      status: 'approved',
      identity: 'approved',
      certificate: 'expired',
      services: [{ category_id: 1, certificate: 'pending' }],
    };
    expect(revokedAsRejected(me)).toEqual(me);
    expect(revokedAsRejected({})).toEqual({});
  });

  it('credentials list: a revoked certificate reads as rejected with the revoke reason', () => {
    expect(
      asRejectedForOldApps({
        id: 'c1',
        status: 'revoked',
        rejection_reason: null,
        revoke_reason: 'Fake number',
      }),
    ).toEqual({
      id: 'c1',
      status: 'rejected',
      rejection_reason: 'Fake number',
      revoke_reason: 'Fake number',
    });
    const approved = { id: 'c2', status: 'approved' };
    expect(asRejectedForOldApps(approved)).toBe(approved);
  });
});
