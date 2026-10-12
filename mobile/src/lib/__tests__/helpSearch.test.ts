import { filterHelpEntries } from '../helpSearch';

const faqs = [
  { q: 'How do payments work?', a: 'Add money to your Wallet via Stripe Checkout. Funds are held in escrow once you hire a provider.' },
  { q: 'How do I hire a provider?', a: 'Post a job, review proposals from providers, and tap Hire.' },
  { q: 'How do I leave a review?', a: 'Once a job is marked complete, open it from My Jobs and tap Leave Review.' },
];
const questions = (rows: { q: string }[]) => rows.map((row) => row.q);

describe('filterHelpEntries', () => {
  it('keeps every question for a blank search', () => {
    expect(questions(filterHelpEntries(faqs, '   '))).toEqual(questions(faqs));
  });

  it('matches the question regardless of case', () => {
    expect(questions(filterHelpEntries(faqs, 'PAYMENTS'))).toEqual(['How do payments work?']);
  });

  it('also matches words in the answer', () => {
    expect(questions(filterHelpEntries(faqs, 'escrow'))).toEqual(['How do payments work?']);
  });

  it('needs every typed word to appear, in any order', () => {
    expect(questions(filterHelpEntries(faqs, 'review complete'))).toEqual(['How do I leave a review?']);
    expect(questions(filterHelpEntries(faqs, 'complete review'))).toEqual(['How do I leave a review?']);
    expect(questions(filterHelpEntries(faqs, 'review stripe'))).toEqual([]);
  });

  it('returns nothing when no question matches', () => {
    expect(filterHelpEntries(faqs, 'zebra')).toEqual([]);
  });
});
