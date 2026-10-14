import {
  SESSION_STAGE,
  UPLOAD_STAGE,
  VERIFY_ID_TYPES,
  addressSaved,
  pendingRows,
  pickVerifyView,
  profileChecks,
  rejectionNote,
  sendingRows,
  takePhotoLabel,
  wizardProgress,
} from '../verifyFlow';

describe('sendingRows', () => {
  it('keeps the stage text the upload code sets, so the checklist can read it', () => {
    expect(UPLOAD_STAGE).toBe('Uploading your documents…');
    expect(SESSION_STAGE).toBe('Opening the automated check…');
  });

  it('shows nothing done before the first stage', () => {
    expect(sendingRows(null).map((row) => row.status)).toEqual(['pending', 'pending', 'pending']);
  });

  it('shows the photos as uploading while the files go up', () => {
    const rows = sendingRows(UPLOAD_STAGE);
    expect(rows.map((row) => row.status)).toEqual(['active', 'active', 'pending']);
    expect(rows[0].label).toBe('Uploading ID photo');
    expect(rows[1].label).toBe('Uploading selfie');
  });

  it('shows the photos as uploaded once the secure check starts', () => {
    const rows = sendingRows(SESSION_STAGE);
    expect(rows.map((row) => row.status)).toEqual(['done', 'done', 'active']);
    expect(rows[0].label).toBe('ID photo uploaded');
    expect(rows[1].label).toBe('Selfie uploaded');
    expect(rows[2].label).toBe('Starting the secure check');
  });

  it('ticks nothing for a stage it does not know', () => {
    expect(sendingRows('Something else').map((row) => row.status)).toEqual(['pending', 'pending', 'pending']);
  });
});

describe('takePhotoLabel', () => {
  it('names the side of the ID the camera button photographs', () => {
    expect(takePhotoLabel('philsys')).toBe('Take photo of the front');
    expect(takePhotoLabel('passport')).toBe('Take photo of the photo page');
    expect(takePhotoLabel(null)).toBe('Take photo of the front');
  });
});

describe('VERIFY_ID_TYPES', () => {
  it('keeps the document_type values the API receives, in the same order', () => {
    expect(VERIFY_ID_TYPES.map((type) => type.value)).toEqual([
      'philsys',
      'drivers_license',
      'umid',
      'passport',
      'postal_id',
    ]);
  });

  it('says which side of each ID to photograph', () => {
    expect(VERIFY_ID_TYPES.map((type) => type.side)).toEqual([
      'Photo of the front',
      'Photo of the front',
      'Photo of the front',
      'Photo page',
      'Photo of the front',
    ]);
  });
});

describe('pickVerifyView', () => {
  const base = {
    loading: false,
    status: null as 'pending' | 'approved' | 'rejected' | null,
    submitting: false,
    started: false,
  };

  it('shows the loader only before any verification has loaded', () => {
    expect(pickVerifyView({ ...base, loading: true })).toBe('loading');
    // A reload keeps the status on screen instead of blanking it.
    expect(pickVerifyView({ ...base, loading: true, status: 'pending' })).toBe('pending');
  });

  it('starts at the intro, and moves to the wizard once started', () => {
    expect(pickVerifyView(base)).toBe('intro');
    expect(pickVerifyView({ ...base, started: true })).toBe('wizard');
  });

  it('shows a pending review or an approval whether or not the wizard was started', () => {
    expect(pickVerifyView({ ...base, status: 'pending', started: true })).toBe('pending');
    expect(pickVerifyView({ ...base, status: 'approved' })).toBe('approved');
  });

  it('shows the rejection first, and the wizard only after Try again', () => {
    expect(pickVerifyView({ ...base, status: 'rejected' })).toBe('rejected');
    expect(pickVerifyView({ ...base, status: 'rejected', started: true })).toBe('wizard');
  });

  it('shows the sending view while submitting, over anything else', () => {
    expect(pickVerifyView({ ...base, submitting: true, started: true, status: 'rejected' })).toBe('sending');
  });

  it('says the status could not be checked, and never shows the intro, when the lookup failed', () => {
    expect(pickVerifyView({ ...base, failed: true })).toBe('error');
    expect(pickVerifyView({ ...base, failed: true, started: true })).toBe('error');
    // A lookup still running is the loader, not the error.
    expect(pickVerifyView({ ...base, failed: true, loading: true })).toBe('loading');
    // A status already on screen stays, even when a refresh failed.
    expect(pickVerifyView({ ...base, failed: true, status: 'pending' })).toBe('pending');
    // A submission in progress wins over the error.
    expect(pickVerifyView({ ...base, failed: true, submitting: true })).toBe('sending');
    // No failure: a provider with no verification yet starts at the intro.
    expect(pickVerifyView({ ...base, failed: false })).toBe('intro');
  });

  it('keeps the loader up after a submission until the new status arrives', () => {
    // The old "rejected" status is still loaded here; it must not flash back on screen.
    expect(pickVerifyView({ ...base, status: 'rejected', started: true, settling: true })).toBe('loading');
  });
});

describe('wizardProgress', () => {
  it('numbers the four steps: your ID, ID photo, selfie, review', () => {
    expect(wizardProgress(1, 'choose')).toEqual({ step: 1, total: 4, label: 'Your ID' });
    expect(wizardProgress(1, 'tips')).toEqual({ step: 2, total: 4, label: 'ID photo' });
    expect(wizardProgress(1, 'check')).toEqual({ step: 2, total: 4, label: 'ID photo' });
    expect(wizardProgress(2, 'check')).toEqual({ step: 3, total: 4, label: 'Selfie' });
    expect(wizardProgress(3, 'check')).toEqual({ step: 4, total: 4, label: 'Review' });
  });
});

describe('addressSaved', () => {
  it('is saved by a street address, or by a city when there is no street address', () => {
    expect(addressSaved({ address: 'Arturo Tanco Drive, Lipa', city: null })).toBe(true);
    expect(addressSaved({ address: null, city: 'Lipa' })).toBe(true);
    expect(addressSaved({ address: '  ', city: ' Lipa ' })).toBe(true);
  });

  it('is not saved when both are empty, blank or missing', () => {
    expect(addressSaved(null)).toBe(false);
    expect(addressSaved(undefined)).toBe(false);
    expect(addressSaved({ address: null, city: null })).toBe(false);
    expect(addressSaved({ address: '   ', city: '\n' })).toBe(false);
  });
});

describe('profileChecks', () => {
  it('lists the address first, then the service, then the bio, as the Home card does', () => {
    expect(profileChecks(null, null).map((item) => item.label)).toEqual(['Address added', 'Service picked', 'Bio added']);
  });

  it('ticks the address by the same rule as the Home card, so a city alone counts', () => {
    expect(profileChecks({ address: null }, null)[0]).toEqual({ label: 'Address added', done: false });
    expect(profileChecks({ address: null, city: 'Lipa' }, null)[0]).toEqual({ label: 'Address added', done: true });
    expect(profileChecks({ address: 'Arturo Tanco Drive, Lipa' }, null)[0]).toEqual({ label: 'Address added', done: true });
  });

  it('ticks the service only once a provider profile exists', () => {
    expect(profileChecks(null, null)[1]).toEqual({ label: 'Service picked', done: false });
    expect(profileChecks(null, { bio: null })[1]).toEqual({ label: 'Service picked', done: true });
  });

  it('ticks the bio only when it has text', () => {
    expect(profileChecks(null, { bio: '   ' })[2]).toEqual({ label: 'Bio added', done: false });
    expect(profileChecks(null, { bio: 'Plumber, 8 years' })[2]).toEqual({ label: 'Bio added', done: true });
  });
});

describe('pendingRows', () => {
  it('for a manual review, says an admin is reviewing now', () => {
    const rows = pendingRows({ method: 'manual', fellBackToManual: false });
    expect(rows.map((row) => [row.title, row.state])).toEqual([
      ['Documents sent', 'done'],
      ['Admin review', 'current'],
      ['You can apply to jobs', 'upcoming'],
    ]);
  });

  it('for the automated check, shows the check as running and never as finished', () => {
    const rows = pendingRows({ method: 'stripe_identity', fellBackToManual: false });
    expect(rows.map((row) => [row.title, row.state])).toEqual([
      ['Documents sent', 'done'],
      ['Automated check', 'current'],
      ['Admin review', 'upcoming'],
      ['You can apply to jobs', 'upcoming'],
    ]);
  });

  it('treats a manual fallback as a manual review', () => {
    const rows = pendingRows({ method: 'stripe_identity', fellBackToManual: true });
    expect(rows.map((row) => row.title)).not.toContain('Automated check');
  });

  it('never says jobs are open while the review is pending', () => {
    for (const method of ['manual', 'stripe_identity'] as const) {
      expect(JSON.stringify(pendingRows({ method, fellBackToManual: false }))).not.toMatch(/jobs? (are )?open/i);
    }
  });
});

describe('rejectionNote', () => {
  it('quotes the admin reason as written', () => {
    expect(rejectionNote('The ID text is blurry.')).toBe('Admin note: The ID text is blurry.');
  });

  it('returns nothing when there is no reason, so the screen does not invent one', () => {
    expect(rejectionNote(null)).toBeNull();
    expect(rejectionNote('   ')).toBeNull();
  });
});
