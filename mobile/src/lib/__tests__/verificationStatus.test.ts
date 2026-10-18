import { canWorkService, certificateExpiry, certificateGuidance, verificationSummary } from '../verificationStatus';

describe('verificationSummary', () => {
  it('says verified only when verified is true', () => {
    expect(verificationSummary({ status: 'approved', identity: 'approved', certificate: 'approved', verified: true }))
      .toMatchObject({ verified: true, headline: "You're verified", missing: [] });
    expect(verificationSummary({ status: 'approved', identity: 'approved', certificate: 'none', verified: false }))
      .toMatchObject({ verified: false, headline: 'ID approved · certificate needed', missing: ['certificate'] });
  });
  it('names the certificate state once the ID is approved', () => {
    const h = (certificate: 'pending' | 'expired' | 'rejected') =>
      verificationSummary({ identity: 'approved', certificate, verified: false }).headline;
    expect(h('pending')).toBe('ID approved · certificate under review');
    expect(h('expired')).toBe('ID approved · certificate expired');
    expect(h('rejected')).toBe('ID approved · certificate not accepted');
  });
  it('reports the ID first when it is not approved', () => {
    expect(verificationSummary({ identity: 'pending', certificate: 'approved', verified: false }))
      .toMatchObject({ headline: 'ID under review', missing: ['identity'] });
    expect(verificationSummary({ identity: 'none', certificate: 'none', verified: false }))
      .toMatchObject({ headline: 'Get verified', missing: ['identity', 'certificate'] });
  });
  it('falls back to status on the old API', () => {
    expect(verificationSummary({ status: 'approved' })).toMatchObject({ verified: true, headline: "You're verified" });
    expect(verificationSummary({ status: 'pending' })).toMatchObject({ verified: false, headline: 'ID under review' });
    expect(verificationSummary(null)).toMatchObject({ verified: false, headline: 'Get verified' });
  });
});

describe('canWorkService', () => {
  const me = {
    identity: 'approved' as const, certificate: 'none' as const, verified: false,
    services: [
      { category_id: 1, name: 'Plumbing', primary: true, certificate: 'none' as const },
      { category_id: 2, name: 'Cleaning', primary: false, certificate: 'approved' as const },
    ],
  };
  it('needs ID and that service certificate; the primary is not required', () => {
    expect(canWorkService(me, 2)).toBe(true);
    expect(canWorkService(me, 1)).toBe(false);
    expect(canWorkService(me, 9)).toBe(false);
    expect(canWorkService({ ...me, identity: 'pending' }, 2)).toBe(false);
  });
  it('uses status on the old API', () => {
    expect(canWorkService({ status: 'approved' }, 5)).toBe(true);
    expect(canWorkService({ status: 'pending' }, 5)).toBe(false);
    expect(canWorkService(null, 5)).toBe(false);
  });
});

describe('certificateExpiry', () => {
  const c = (category_id: number, expires_on: string | null, status: 'approved' | 'expired' | 'pending' = 'approved') =>
    ({ category_id, status, expires_on });
  it('sorts approved certificates into ok, expiring and expired', () => {
    const out = certificateExpiry([c(1, '2027-01-01'), c(2, '2026-11-10'), c(3, '2026-10-01'), c(4, null)], '2026-10-18');
    expect(out).toEqual([
      { categoryId: 1, state: 'ok', daysLeft: 75 },
      { categoryId: 2, state: 'expiring', daysLeft: 23 },
      { categoryId: 3, state: 'expired', daysLeft: -17 },
      { categoryId: 4, state: 'ok', daysLeft: null },
    ]);
  });
  it('treats exactly 30 days as expiring and today as 0 days left', () => {
    expect(certificateExpiry([c(1, '2026-11-17')], '2026-10-18')[0]).toMatchObject({ state: 'expiring', daysLeft: 30 });
    expect(certificateExpiry([c(1, '2026-10-18')], '2026-10-18')[0]).toMatchObject({ state: 'expiring', daysLeft: 0 });
  });
  it('keeps the longest-lasting certificate and ignores pending ones', () => {
    const out = certificateExpiry([c(1, '2026-10-20'), c(1, '2027-06-01'), c(2, '2026-10-20', 'pending')], '2026-10-18');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ categoryId: 1, state: 'ok' });
  });
  it('reports a service whose only certificate is expired', () => {
    expect(certificateExpiry([c(1, '2026-01-01', 'expired')], '2026-10-18')).toEqual([{ categoryId: 1, state: 'expired', daysLeft: 0 }]);
    expect(certificateExpiry(null, '2026-10-18')).toEqual([]);
  });
});

describe('certificateGuidance', () => {
  it('names the certificate per service', () => {
    expect(certificateGuidance('Plumbing')).toContain('TESDA Plumbing NC II');
    expect(certificateGuidance('Cleaning')).toContain('Housekeeping NC II');
    expect(certificateGuidance('Handyman')).toContain('Carpentry or Electrical Installation and Maintenance NC II');
    expect(certificateGuidance('Manicure / Pedicure')).toContain('Beauty Care NC II');
    expect(certificateGuidance('Gardening')).toContain('a TESDA, PRC or trade certificate that matches the service');
    expect(certificateGuidance(null)).toContain('An admin checks it matches your service.');
  });
});
