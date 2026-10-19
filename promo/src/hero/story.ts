// Hero loop timeline, 30 fps. Both phones act in one continuous take.
// Names, places and amounts are sample data; screen text follows the mobile app.
export const CLIENT = { name: 'Ana Reyes', first: 'Ana', ini: 'AR' };
export const PRO = { name: 'Mark Santos', first: 'Mark', ini: 'MS' };
export const JOB = {
  title: 'Plumbing: Fix leaking faucet', service: 'Plumbing', price: 1200, fee: 180, net: 1020,
  address: 'Brgy. Poblacion, Lipa City', day: 'Tue, Oct 20', dayUpper: 'TUE, OCT 20', when: 'Oct 20, 2026 · 9:00 AM',
  tasks: ['Fix leaking faucet', 'Unclog drain'],
  description: 'Plumbing service needed. Tasks: Fix leaking faucet, Unclog drain.',
};
export const MSG = 'Hi Ana! I can come on Oct 20 at 9 AM and I will bring the parts.';

export const K = {
  // 1. provider gets verified
  pVerifyTap: 12, pStep1: 18, pPickId: 30, pStep1Next: 40,
  pStep2: 46, pUsePhoto: 64, pStep3: 70, pSelfieNext: 90,
  pStep4: 96, pCertNext: 118, pStep5: 124, pAgree: 134, pSecure: 144,
  pPending: 150, pVerified: 160, pFeed: 178,
  // 2. client posts a job
  cPostTap: 140, cStep1: 146, cPickSvc: 160, cStep1Next: 170,
  cStep2: 176, cStep2Next: 206, cStep3: 212, cTask1: 222, cTask2: 232, cStep3Next: 244,
  cStep4: 250, cUrgent: 258, cScroll: 262, cPickPrice: 282, cStep4Next: 292, cStep5: 298, cPost: 316, cWaiting: 322,
  // 3. job reaches the provider, proposal goes back
  jobFly: 328, jobLand: 352, pOpenJob: 366, pDetail: 372, pSendTap: 388, pSheet: 394,
  pTypeA: 402, pTypeB: 436, pSend: 446, pSent: 452, propFly: 454, propLand: 476,
  // 4. client hires and pays
  cOpenProps: 492, cProps: 498, cHireTap: 516, cHireSheet: 522, cContinue: 540, cConfirmPage: 546, cPay: 562, cBooked: 568,
  bookFly: 572, bookLand: 592,
  // 5. provider booked, starts
  pBooked: 594, pStart: 636,
  // 6. chat
  chat: 648,
  // 7. tasks ticked (each needs a proof photo), client confirms
  work: 748, pTick1: 742, pTick2Tap: 758, proofSheet: 762, proofAdd: 778, proofDone: 788, pTick2: 792,
  doneFly: 796, doneLand: 812, cConfirm: 832,
  // 8. payment released
  paid: 838, coinFly: 840, coinLand: 862,
  // 9. review
  cLeaveReview: 904, review: 910, stars: [924, 929, 934, 939, 944], chip1: 952, chip2: 958, typeA: 964, typeB: 988, submit: 998,
  starFly: 1000, starLand: 1008,
  end: 1050,
};

export const CHAT = [
  { at: 658, from: 'c' as const, t: 'Hi Mark! It is the house with the blue gate.' },
  { at: 688, from: 'p' as const, t: "Got it! I'll be there at 9." },
  { at: 716, from: 'c' as const, t: 'Thank you!' },
];

/** Every tap frame on each phone, so guides can play taps at real speed. */
export const TAPS: Record<'c' | 'p', number[]> = {
  c: [K.cPostTap, K.cPickSvc, K.cStep1Next, K.cStep2Next, K.cTask1, K.cTask2, K.cStep3Next, K.cUrgent, K.cPickPrice, K.cStep4Next, K.cPost,
    K.cOpenProps, K.cConfirm, K.cLeaveReview, K.cHireTap, K.cContinue, K.cPay, ...K.stars, K.chip1, K.chip2, K.submit],
  p: [K.pVerifyTap, K.pOpenJob, K.pPickId, K.pStep1Next, K.pUsePhoto, K.pSelfieNext, K.pCertNext, K.pAgree, K.pSecure, K.pSendTap,
    K.pStart, K.pTick2Tap, K.proofAdd, K.proofDone, K.pSend],
};

/** Frames where text is being typed; a guide never pauses in the middle of one. */
export const TYPING: Record<'c' | 'p', [number, number][]> = {
  c: [[K.cStep2 + 4, K.cStep2 + 24], [K.typeA, K.typeB]],
  p: [[K.pStep4 + 8, K.pStep4 + 18], [K.pTypeA, K.pTypeB]],
};
