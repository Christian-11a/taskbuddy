import { PRIVACY_CONTENT, TERMS_CONTENT, TERMS_UPDATED, TERMS_VERSION } from '../legalText';

describe('legalText', () => {
  it('keeps the terms version the backend compares against', () => {
    expect(TERMS_VERSION).toBe(3);
  });

  it('opens the Terms on the intro paragraph, with no heading above it', () => {
    const [intro] = TERMS_CONTENT.sections;
    expect(intro.heading).toBeUndefined();
    expect(intro.body).toMatch(/^These Terms govern your use of TaskBuddy\./);
  });

  it('shows no version number or date in any Terms heading', () => {
    for (const { heading } of TERMS_CONTENT.sections) {
      expect(heading ?? '').not.toMatch(/version/i);
      expect(heading ?? '').not.toContain(TERMS_UPDATED);
    }
  });

  it('keeps a heading on every numbered Terms section and every privacy section', () => {
    const numbered = TERMS_CONTENT.sections.slice(1);
    expect(numbered).toHaveLength(12);
    numbered.forEach((s, i) => expect(s.heading).toMatch(new RegExp(`^${i + 1}\\. `)));
    for (const s of PRIVACY_CONTENT.sections) expect(s.heading).toBeTruthy();
  });

  it('keeps a body on every section', () => {
    for (const s of [...TERMS_CONTENT.sections, ...PRIVACY_CONTENT.sections]) expect(s.body.trim()).not.toBe('');
  });
});
