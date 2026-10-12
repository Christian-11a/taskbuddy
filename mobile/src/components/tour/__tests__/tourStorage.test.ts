import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasCompletedTour,
  hasDismissedTourOffer,
  markTourCompleted,
  markTourOfferDismissed,
} from '../tourStorage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('tour flags', () => {
  it('reads as not set until they are written', async () => {
    expect(await hasCompletedTour('p1')).toBe(false);
    expect(await hasDismissedTourOffer('p1')).toBe(false);
  });

  it('stores completion under tour.done.<profileId>, per account', async () => {
    await markTourCompleted('p1');

    expect(await AsyncStorage.getItem('tour.done.p1')).toBe('true');
    expect(await hasCompletedTour('p1')).toBe(true);
    expect(await hasCompletedTour('p2')).toBe(false);
  });

  it('stores the dismissed offer under tour.offer.dismissed.<profileId>, separate from completion', async () => {
    await markTourOfferDismissed('p1');

    expect(await AsyncStorage.getItem('tour.offer.dismissed.p1')).toBe('true');
    expect(await hasDismissedTourOffer('p1')).toBe(true);
    expect(await hasDismissedTourOffer('p2')).toBe(false);
    expect(await hasCompletedTour('p1')).toBe(false);
  });
});

describe('tour flags when storage fails', () => {
  it('reads completion as not done, so the tour is offered again', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'));

    expect(await hasCompletedTour('p1')).toBe(false);
  });

  it('reads the dismissed offer as not dismissed', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk full'));

    expect(await hasDismissedTourOffer('p1')).toBe(false);
  });

  it('ignores a failed write of completion', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(markTourCompleted('p1')).resolves.toBeUndefined();
  });

  it('ignores a failed write of the dismissed offer', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));

    await expect(markTourOfferDismissed('p1')).resolves.toBeUndefined();
  });
});
