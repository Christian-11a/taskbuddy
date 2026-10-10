import {
  VERIFY_ID_TYPES,
  pickVerifyView,
  profileChecks,
  takePhotoLabel,
  wizardProgress,
} from '../verifyFlow';

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

describe('profileChecks', () => {
  it('ticks the service only once a provider profile exists', () => {
    expect(profileChecks(null)[0]).toEqual({ label: 'Service picked', done: false });
    expect(profileChecks({ bio: null })[0]).toEqual({ label: 'Service picked', done: true });
  });

  it('ticks the bio only when it has text', () => {
    expect(profileChecks({ bio: '   ' })[1]).toEqual({ label: 'Bio added', done: false });
    expect(profileChecks({ bio: 'Plumber, 8 years' })[1]).toEqual({ label: 'Bio added', done: true });
  });
});
