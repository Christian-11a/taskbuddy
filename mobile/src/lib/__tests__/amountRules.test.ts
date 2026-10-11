import { nextAmountText, parseAmount, validateAmount } from '../amountRules';

/** Types `text` one character at a time into an empty field, the way a keyboard does. */
function typeOneByOne(text: string): string {
  let shown = '';
  for (const ch of text) shown = nextAmountText(shown, shown + ch);
  return shown;
}

describe('nextAmountText: what an amount field shows after a change', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['5', '5'],
    ['123', '123'],
    ['1500', '1500'],
    ['1234567890', '1234567890'],
  ])('keeps whole digits: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['12.', '12.'],
    ['12.5', '12.5'],
    ['12.34', '12.34'],
    ['0.99', '0.99'],
    ['1500.00', '1500.00'],
  ])('keeps one dot and up to two decimal places: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['12.345', '12.34'],
    ['12.349', '12.34'],
    ['0.999', '0.99'],
    ['1.2345678', '1.23'],
  ])('cuts a third decimal place instead of rounding it: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['1.2.3', '1.23'],
    ['1..2', '1.2'],
    ['..5', '0.5'],
    ['1.2.', '1.2'],
  ])('keeps only the first dot and carries on with the digits: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['.', '0.'],
    ['.5', '0.5'],
    ['.55', '0.55'],
    ['.555', '0.55'],
  ])('makes a leading dot read as 0.: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['007', '7'],
    ['0005', '5'],
    ['00', '0'],
    ['000', '0'],
    ['0', '0'],
    ['0.5', '0.5'],
    ['00.5', '0.5'],
    ['010.10', '10.10'],
  ])('drops leading zeros but keeps one zero before a dot: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['1,000', '1000'],
    ['1,000.50', '1000.50'],
    ['1,000,000', '1000000'],
  ])('drops thousands commas: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['1 000', '1000'],
    ['  12  ', '12'],
    ['\t7\n', '7'],
    ['₱500', '500'],
    ['₱ 250', '250'],
  ])('drops only spaces, line breaks and the peso sign: %j -> %j', (raw, expected) => {
    expect(nextAmountText('', raw)).toBe(expected);
  });

  it.each([
    ['', 'abc'],
    ['12', '12a'],
    ['', 'a1b2'],
    ['', '1e5'],
    ['', '1e3'],
    ['250', '1e3'],
    ['', '-1000'],
    ['250', '-1000'],
    ['', '-5'],
    ['', '5-'],
    ['', '+5'],
    ['', '$1.00'],
    ['', '5%'],
    ['', '(5)'],
    ['', '5/5'],
    ['', '1_000'],
    ['', '١٢'],
  ])('over %j, a change to %j is refused and the field keeps its value', (previous, incoming) => {
    expect(nextAmountText(previous, incoming)).toBe(previous);
  });

  it('types one character at a time to the same result as the whole text', () => {
    expect(typeOneByOne('12.345')).toBe('12.34');
  });

  it('turns a letter-only entry into an empty field', () => {
    expect(typeOneByOne('hello')).toBe('');
  });

  it('refuses a typed minus sign, and a second dot adds nothing to the amount', () => {
    expect(typeOneByOne('-5')).toBe('5');
    expect(typeOneByOne('5-')).toBe('5');
    expect(typeOneByOne('5..')).toBe('5.');
  });
});

describe('parseAmount: the number the text stands for', () => {
  it.each([
    ['1500', 1500],
    ['0', 0],
    ['0.5', 0.5],
    ['.5', 0.5],
    ['12.50', 12.5],
    ['12.34', 12.34],
    ['100000', 100000],
    ['007', 7],
    ['5.', 5],
    ['  12  ', 12],
    ['1,500.50', 1500.5],
    ['1,000,000', 1000000],
  ])('reads %j as %j', (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['.'],
    ['abc'],
    ['12a'],
    ['12.345'],
    ['1.2.3'],
    ['-5'],
    ['+5'],
    ['1 000'],
    ['1e5'],
    ['₱5'],
  ])('reads %j as not an amount', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('validateAmount: why an amount is refused', () => {
  const withdraw = { min: 1, max: 425, label: 'an amount' };
  const topUp = { min: 50, max: 100000 };
  const overBalance = (max: number) => `That's more than your ₱${max.toFixed(2)} available.`;

  it.each([
    ['', 'Enter an amount'],
    ['   ', 'Enter an amount'],
  ])('asks for an amount when the field is empty: %j', (text, message) => {
    expect(validateAmount(text, withdraw)).toBe(message);
  });

  it.each([
    ['abc'],
    ['12a'],
    ['-5'],
    ['₱5'],
    ['5%'],
    ['1e5'],
  ])('says numbers only for letters and symbols: %j', (text) => {
    expect(validateAmount(text, topUp)).toBe('Enter numbers only');
  });

  it('says up to two decimal places for a third decimal', () => {
    expect(validateAmount('12.345', topUp)).toBe('Up to 2 decimal places');
  });

  it.each([
    ['1.2.3'],
    ['.'],
  ])('says the amount is not valid for a shape it cannot read: %j', (text) => {
    expect(validateAmount(text, topUp)).toBe('Enter a valid amount');
  });

  it('refuses zero when there is no lower bound, and says so', () => {
    expect(validateAmount('0', { max: 1000000 })).toBe('Enter an amount greater than zero');
    expect(validateAmount('0.00', {})).toBe('Enter an amount greater than zero');
  });

  it('reports zero as below the minimum once there is one', () => {
    expect(validateAmount('0', withdraw)).toBe('Minimum is ₱1');
    expect(validateAmount('0', topUp)).toBe('Minimum is ₱50');
  });

  it.each([
    ['0.5', withdraw, 'Minimum is ₱1'],
    ['0.99', withdraw, 'Minimum is ₱1'],
    ['49.99', topUp, 'Minimum is ₱50'],
    ['20', topUp, 'Minimum is ₱50'],
  ])('refuses %j below the minimum, with %j', (text, limits, message) => {
    expect(validateAmount(text, limits)).toBe(message);
  });

  it.each([
    ['1', withdraw],
    ['424.99', withdraw],
    ['425', withdraw],
    ['12.34', withdraw],
  ])('accepts %j for the withdraw limits', (text, limits) => {
    expect(validateAmount(text, limits)).toBeNull();
  });

  it.each([
    ['50'],
    ['100000'],
    ['1500.5'],
  ])('accepts %j for the top-up limits', (text) => {
    expect(validateAmount(text, topUp)).toBeNull();
  });

  it('cuts 49.99999 to 49.99 while typing, which is then below the top-up minimum', () => {
    expect(validateAmount(nextAmountText('', '49.99999'), topUp)).toBe('Minimum is ₱50');
  });

  it('accepts exactly the top-up maximum and refuses one centavo more', () => {
    expect(validateAmount('100000', topUp)).toBeNull();
    expect(validateAmount('100000.01', topUp)).toBe("You can't go over ₱100,000");
  });

  it('says the top-up ceiling in whole pesos with thousands separators', () => {
    expect(validateAmount('100001', topUp)).toBe("You can't go over ₱100,000");
  });

  it('uses the screen wording for an amount over the balance', () => {
    expect(validateAmount('425.01', { ...withdraw, overMessage: overBalance })).toBe(
      "That's more than your ₱425.00 available.",
    );
  });

  it('falls back to the ceiling wording when no screen wording is given', () => {
    expect(validateAmount('425.01', withdraw)).toBe("You can't go over ₱425");
  });

  it('allows a budget up to the ceiling and refuses one more peso', () => {
    expect(validateAmount('1000000', { max: 1000000 })).toBeNull();
    expect(validateAmount('1000001', { max: 1000000 })).toBe("You can't go over ₱1,000,000");
  });

  it('uses the label in the empty message', () => {
    expect(validateAmount('', { label: 'a budget' })).toBe('Enter a budget');
  });

  it('reads commas as separators, not as a refusal', () => {
    expect(validateAmount('1,000', topUp)).toBeNull();
    expect(validateAmount('1,000.50', topUp)).toBeNull();
  });

  it('accepts any positive amount when no limits are given', () => {
    expect(validateAmount('0.01', {})).toBeNull();
    expect(validateAmount('999999999', {})).toBeNull();
  });
});
