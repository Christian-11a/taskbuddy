import { changedFields, leaveMessageFor } from '../editProfileChanges';

const loaded = {
  name: 'Alex',
  phone: '09171234567',
  address: 'Old address',
  city: 'Quezon City',
  pickedAddress: false,
};

describe('changedFields', () => {
  it('is empty when every field matches what was loaded', () => {
    expect(changedFields(loaded, { ...loaded })).toEqual([]);
  });

  it('names each field that differs', () => {
    expect(changedFields(loaded, { ...loaded, name: 'Alexa' })).toEqual(['name']);
    expect(changedFields(loaded, { ...loaded, phone: '09990000000' })).toEqual(['phone']);
    expect(changedFields(loaded, { ...loaded, address: 'New street' })).toEqual(['address']);
    expect(changedFields(loaded, { ...loaded, city: 'Batangas' })).toEqual(['city']);
  });

  it('counts a picked suggestion as a change even when the text is the same', () => {
    expect(changedFields(loaded, { ...loaded, pickedAddress: true })).toEqual(['pickedAddress']);
  });

  it('ignores spaces around a value, because saving trims them', () => {
    expect(changedFields(loaded, { ...loaded, name: '  Alex ' })).toEqual([]);
  });

  it('counts a cleared value as a change', () => {
    expect(changedFields(loaded, { ...loaded, phone: '' })).toEqual(['phone']);
  });

  it('treats an empty value and a missing one as the same', () => {
    expect(changedFields({ ...loaded, phone: null }, { ...loaded, phone: '' })).toEqual([]);
  });

  it('reports every changed field, in the order they were loaded', () => {
    expect(changedFields(loaded, { ...loaded, city: 'Batangas', name: 'Alexa' })).toEqual(['name', 'city']);
  });

  it('compares a service id by its value, so a newly picked service counts', () => {
    expect(changedFields({ service: 3 }, { service: 3 })).toEqual([]);
    expect(changedFields({ service: 3 }, { service: 4 })).toEqual(['service']);
    expect(changedFields({ service: null }, { service: 2 })).toEqual(['service']);
  });
});

describe('leaveMessageFor', () => {
  it('names the one changed field and says that change is lost', () => {
    expect(leaveMessageFor(['phone'])).toBe(
      'You changed your phone number. If you leave now, that change is lost.',
    );
  });

  it('lists several fields and says those changes are lost', () => {
    expect(leaveMessageFor(['name', 'phone', 'city'])).toBe(
      'You changed your name, phone number and city. If you leave now, those changes are lost.',
    );
  });

  it('says address once when both the text and a picked suggestion changed', () => {
    expect(leaveMessageFor(['address', 'pickedAddress'])).toBe(
      'You changed your address. If you leave now, that change is lost.',
    );
  });

  it('uses the profile words for the bio, radius and service fields', () => {
    expect(leaveMessageFor(['bio'])).toBe('You changed your bio. If you leave now, that change is lost.');
    expect(leaveMessageFor(['radius'])).toBe(
      'You changed your service radius. If you leave now, that change is lost.',
    );
    expect(leaveMessageFor(['service'])).toBe('You changed your service. If you leave now, that change is lost.');
  });
});
