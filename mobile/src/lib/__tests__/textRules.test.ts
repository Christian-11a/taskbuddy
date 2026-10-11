import {
  BIO_MAX,
  BIO_MIN,
  SEARCH_MAX_LENGTH,
  TITLE_MAX,
  TITLE_MIN,
  cleanText,
  textLength,
  textUnits,
  validateAccountNumber,
  validateBio,
  validateText,
  validateTitle,
} from '../textRules';

describe('cleanText: the text as it is sent', () => {
  it.each([
    ['abc', 'abc'],
    ['  Fixed it  ', 'Fixed it'],
    ['\n\nhi\n\n', 'hi'],
    ['\r\nhi\r\n', 'hi'],
    ['\t tab and spaces \t', 'tab and spaces'],
    ['   ', ''],
    ['\n\n\n', ''],
    ['', ''],
  ])('trims the ends: %j -> %j', (raw, expected) => {
    expect(cleanText(raw)).toBe(expected);
  });

  it.each([
    ['a\r\nb', 'a\nb'],
    ['a\rb', 'a\nb'],
    ['a\r\n\r\nb', 'a\n\nb'],
  ])('makes line endings \\n: %j -> %j', (raw, expected) => {
    expect(cleanText(raw)).toBe(expected);
  });

  it.each([
    ['a\n\nb', 'a\n\nb'],
    ['a\n\n\nb', 'a\n\nb'],
    ['a\n\n\n\n\nb', 'a\n\nb'],
    ['a\n \n \n b', 'a\n\n b'],
    ['a\n\n\n\n\n\n\n\n\n\nb', 'a\n\nb'],
  ])('cuts a run of blank lines to one blank line: %j -> %j', (raw, expected) => {
    expect(cleanText(raw)).toBe(expected);
  });

  it.each([
    ['a\nb\nc', 'a\nb\nc'],
    ['a b  c', 'a b  c'],
    ['a\tb', 'a\tb'],
  ])('leaves text inside a line alone: %j -> %j', (raw, expected) => {
    expect(cleanText(raw)).toBe(expected);
  });
});

describe('textLength and textUnits: how long the cleaned text is', () => {
  it('counts characters after cleaning, so spaces at the ends do not count', () => {
    expect(textLength('  ab  ')).toBe(2);
    expect(textLength('   ')).toBe(0);
    expect(textLength('')).toBe(0);
    expect(textLength('a\n\n\n\nb')).toBe(4);
  });

  it('counts one emoji as one character but two UTF-16 units', () => {
    expect(textLength('😀')).toBe(1);
    expect(textUnits('😀')).toBe(2);
    expect(textLength('😀😀😀😀😀')).toBe(5);
    expect(textUnits('😀😀😀😀😀')).toBe(10);
  });
});

describe('validateText: what makes free text unacceptable', () => {
  it('lets an optional field stay empty, or hold only spaces', () => {
    expect(validateText('', { max: 10 })).toBeNull();
    expect(validateText('   ', { max: 10, min: 5 })).toBeNull();
  });

  it('refuses an empty required field, and says what to add', () => {
    expect(validateText('', { required: true, label: 'a reason' })).toBe('Add a reason');
    expect(validateText('   ', { required: true, label: 'a reason' })).toBe('Add a reason');
    expect(validateText('\n\n', { required: true, label: 'your message' })).toBe('Add your message');
  });

  it('asks for more words below the minimum, counting after the spaces are trimmed', () => {
    const limits = { min: 20, label: 'a message', required: true };
    expect(validateText('abcd', limits)).toBe('Add a few more words (at least 20 characters)');
    expect(validateText('  abcd  ', limits)).toBe('Add a few more words (at least 20 characters)');
    expect(validateText('x'.repeat(19), limits)).toBe('Add a few more words (at least 20 characters)');
  });

  it('accepts text exactly at the minimum', () => {
    expect(validateText('x'.repeat(20), { min: 20 })).toBeNull();
    expect(validateText('  x  ', { min: 1, required: true })).toBeNull();
  });

  it('still asks for the minimum on an optional field that has any text', () => {
    expect(validateText('abc', { min: 5 })).toBe('Add a few more words (at least 5 characters)');
  });

  it('accepts text up to the maximum and says how far over it is past that', () => {
    expect(validateText('x'.repeat(10), { max: 10 })).toBeNull();
    expect(validateText('x'.repeat(11), { max: 10 })).toBe("Keep it under 10 characters (you're 1 over)");
    expect(validateText('x'.repeat(13), { max: 10 })).toBe("Keep it under 10 characters (you're 3 over)");
  });

  it('checks the maximum on the cleaned text, not on the blank lines typed around it', () => {
    expect(validateText(`${'x'.repeat(8)}\n\n\n\n\n`, { max: 10 })).toBeNull();
  });

  it('counts an emoji as two units against the maximum, as the request does', () => {
    expect(validateText('😀'.repeat(5), { max: 10 })).toBeNull();
    expect(validateText('😀'.repeat(6), { max: 10 })).toBe("Keep it under 10 characters (you're 2 over)");
  });

  it('counts characters, not units, against the minimum, as the database does', () => {
    expect(validateText('😀'.repeat(4), { min: 5 })).toBe('Add a few more words (at least 5 characters)');
    expect(validateText('😀'.repeat(5), { min: 5 })).toBeNull();
  });

  it('checks the minimum before the maximum, so a short text is never called too long', () => {
    expect(validateText('ab', { min: 5, max: 1 })).toBe('Add a few more words (at least 5 characters)');
  });
});

describe('validateTitle: the job title, with the wording the form has always used', () => {
  it('keeps the title bounds the backend asks for', () => {
    expect(TITLE_MIN).toBe(5);
    expect(TITLE_MAX).toBe(120);
  });

  it.each([
    ['', 'Title must be at least 5 characters.'],
    ['abcd', 'Title must be at least 5 characters.'],
    ['  abcd  ', 'Title must be at least 5 characters.'],
    ['     ', 'Title must be at least 5 characters.'],
  ])('refuses %j as too short', (title, message) => {
    expect(validateTitle(title)).toBe(message);
  });

  it('accepts five characters and up to 120', () => {
    expect(validateTitle('abcde')).toBeNull();
    expect(validateTitle('x'.repeat(120))).toBeNull();
    expect(validateTitle('  ' + 'x'.repeat(120) + '  ')).toBeNull();
  });

  it('refuses more than 120 characters', () => {
    expect(validateTitle('x'.repeat(121))).toBe('Title cannot exceed 120 characters.');
  });
});

describe('validateAccountNumber: the withdrawal destination', () => {
  it.each([
    ['', 'Add where to send it.'],
    ['   ', 'Add where to send it.'],
  ])('asks for a destination when it is empty: %j', (value, message) => {
    expect(validateAccountNumber(value)).toBe(message);
  });

  describe('a GCash number is 09 followed by nine digits', () => {
    it.each([
      ['09171234567'],
      ['0917 123 4567'],
      ['0917-123-4567'],
      ['0917.123.4567'],
      ['(0917) 123 4567'],
      ['GCash 0917 123 4567'],
      ['gcash 09171234567'],
      ['GCash: 0917-123-4567'],
      ['Maya 0917 123 4567'],
      ['  09171234567  '],
    ])('accepts %j', (value) => {
      expect(validateAccountNumber(value)).toBeNull();
    });

    it.each([
      ['0917123456', 'A GCash number is 09 followed by 9 digits.'],
      ['091712345678', 'A GCash number is 09 followed by 9 digits.'],
      ['0917 123 456', 'A GCash number is 09 followed by 9 digits.'],
      ['GCash 0917123456', 'A GCash number is 09 followed by 9 digits.'],
      ['GCash 12345678901', 'A GCash number is 09 followed by 9 digits.'],
      ['GCash 09XX XXX XXXX', 'A GCash number is 09 followed by 9 digits.'],
    ])('refuses %j', (value, message) => {
      expect(validateAccountNumber(value)).toBe(message);
    });
  });

  describe('a bank account number is 8 to 20 digits', () => {
    it.each([
      ['12345678'],
      ['123456789012'],
      ['12345678901234567890'],
      ['BDO 1234 5678 9012'],
      ['BDO 1234-5678-9012'],
      ['Juan dela Cruz BPI 00123456789'],
      ['Metrobank 1234 5678 9012 3456'],
      ['Bank 09123456789'],
    ])('accepts %j', (value) => {
      expect(validateAccountNumber(value)).toBeNull();
    });

    it.each([
      ['1234567', 'A bank account number is 8 to 20 digits.'],
      ['123456789012345678901', 'A bank account number is 8 to 20 digits.'],
      ['BDO 1234567', 'A bank account number is 8 to 20 digits.'],
    ])('refuses %j', (value, message) => {
      expect(validateAccountNumber(value)).toBe(message);
    });
  });

  it('refuses a plus sign, so an international number is not taken for a bank account', () => {
    expect(validateAccountNumber('+639171234567')).toBe('Use digits only, with no + sign.');
    expect(validateAccountNumber('GCash +63 917 123 4567')).toBe('Use digits only, with no + sign.');
  });

  it('refuses a destination with no number in it', () => {
    expect(validateAccountNumber('GCash')).toBe('Add your GCash number or bank account number.');
    expect(validateAccountNumber('Cash pickup at Ortigas')).toBe('Add your GCash number or bank account number.');
  });

  it('refuses a destination with two numbers in it', () => {
    expect(validateAccountNumber('GCash 0917 123 4567 BDO 12345678')).toBe(
      'Keep it to one number: your GCash or bank account number.',
    );
    expect(validateAccountNumber('0917 123 4567 / 1234 5678')).toBe(
      'Keep it to one number: your GCash or bank account number.',
    );
  });

  it('does not split a number written with a line break into two numbers', () => {
    expect(validateAccountNumber('GCash\n0917 123 4567')).toBeNull();
  });
});

describe('the search box', () => {
  it('caps a search at 100 characters', () => {
    expect(SEARCH_MAX_LENGTH).toBe(100);
  });
});

describe('validateBio: the provider bio rule', () => {
  it('takes the backend bounds, 20 to 400', () => {
    expect(BIO_MIN).toBe(20);
    expect(BIO_MAX).toBe(400);
  });

  it('needs 20 characters once cleaned, and empty or spaces-only is too short', () => {
    expect(validateBio('')).toBe('Bio must be at least 20 characters.');
    expect(validateBio(' '.repeat(40))).toBe('Bio must be at least 20 characters.');
    expect(validateBio('x'.repeat(19))).toBe('Bio must be at least 20 characters.');
    expect(validateBio(`${'x'.repeat(19)}\n\n\n\n\n`)).toBe('Bio must be at least 20 characters.');
    expect(validateBio('x'.repeat(20))).toBeNull();
    expect(validateBio('  Plumbing and drain.  ')).toBe('Bio must be at least 20 characters.');
    expect(validateBio('  Plumbing and drains.  ')).toBeNull();
  });

  it('allows up to 400 characters and no more', () => {
    expect(validateBio('x'.repeat(400))).toBeNull();
    expect(validateBio('x'.repeat(401))).toBe('Bio cannot exceed 400 characters.');
  });

  it('counts an emoji as two units against the 400, the way the API does', () => {
    expect(validateBio('😀'.repeat(200))).toBeNull();
    expect(validateBio('😀'.repeat(201))).toBe('Bio cannot exceed 400 characters.');
  });
});
