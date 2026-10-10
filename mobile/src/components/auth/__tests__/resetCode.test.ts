import {
  CODE_LENGTH,
  activeBoxIndex,
  applyCodeInput,
  boxCharacters,
  formatCooldown,
  maskEmail,
} from '../resetCode';

describe('applyCodeInput — the six reset-code boxes', () => {
  it('keeps digits only and never more than six', () => {
    expect(applyCodeInput('', '48 29-3')).toBe('48293');
    expect(applyCodeInput('', '4829311234')).toBe('482931');
    expect(CODE_LENGTH).toBe(6);
  });

  it('auto-advances: each typed digit extends the code and moves to the next box', () => {
    let code = '';
    for (const digit of ['4', '8', '2']) code = applyCodeInput(code, code + digit);

    expect(code).toBe('482');
    expect(activeBoxIndex(code)).toBe(3);
  });

  it('backspace moves back: removing the last digit makes its box the active one again', () => {
    const code = applyCodeInput('4829', '482');

    expect(code).toBe('482');
    expect(activeBoxIndex(code)).toBe(3);
  });

  it('paste into an empty code fills all six boxes', () => {
    const code = applyCodeInput('', '482931');

    expect(boxCharacters(code)).toEqual(['4', '8', '2', '9', '3', '1']);
    expect(activeBoxIndex(code)).toBe(5);
  });

  it('paste after some digits keeps only the pasted code', () => {
    expect(applyCodeInput('48', '48829310')).toBe('829310');
  });

  it('paste in front of existing digits keeps the pasted digits first', () => {
    expect(applyCodeInput('48', '82931048')).toBe('829310');
  });

  it('ignores an extra digit typed into a full code', () => {
    expect(applyCodeInput('482931', '4829317')).toBe('482931');
  });
});

describe('boxCharacters and activeBoxIndex', () => {
  it('shows empty strings for the boxes that are not filled yet', () => {
    expect(boxCharacters('48')).toEqual(['4', '8', '', '', '', '']);
  });

  it('keeps the last box active once all six are filled', () => {
    expect(activeBoxIndex('')).toBe(0);
    expect(activeBoxIndex('123456')).toBe(5);
  });
});

describe('maskEmail', () => {
  it('keeps the first two letters and the last letter of a longer name, and the whole domain', () => {
    expect(maskEmail('ana.reyes@example.com')).toBe('an•••s@example.com');
  });

  it('keeps only the first letter of a short name', () => {
    expect(maskEmail('ana@example.com')).toBe('a•••@example.com');
  });

  it('returns a plain mask when there is no @ to split on', () => {
    expect(maskEmail('not-an-email')).toBe('•••');
  });
});

describe('formatCooldown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCooldown(60)).toBe('1:00');
    expect(formatCooldown(42)).toBe('0:42');
    expect(formatCooldown(5)).toBe('0:05');
    expect(formatCooldown(0)).toBe('0:00');
  });
});
