import {
  OTP_LENGTH,
  PASSWORD_MIN_LENGTH,
  PHONE_INPUT_MAX_LENGTH,
  normalizeEmail,
  normalizeName,
  sanitizeOtp,
  sanitizePhone,
  validateAddress,
  validateCity,
  validateEmail,
  validateFullName,
  validateNewPasswordDiffers,
  validateOtpCode,
  validatePasswordRules,
  validatePhone,
  validateServiceRadius,
} from '../inputRules';

const PHONE_FORMAT = 'Enter an 11-digit mobile number starting with 09, e.g. 09171234567';
const NAME_CHARACTERS = 'Full name can only use letters, spaces, hyphens, apostrophes and periods';

describe('sanitizePhone', () => {
  it.each([
    ['', ''],
    ['   ', ''],
    ['abc', ''],
    ['+', ''],
    ['09171234567', '09171234567'],
    ['0917 123 4567', '09171234567'],
    ['0917-123-4567', '09171234567'],
    ['(0917) 123 4567', '09171234567'],
    ['0917123456a', '0917123456'],
  ])('keeps only the digits of %j, giving %j', (raw, expected) => {
    expect(sanitizePhone(raw)).toBe(expected);
  });

  it.each([
    ['+63 917 123 4567', '09171234567'],
    ['63 917 123 4567', '09171234567'],
    ['+639171234567', '09171234567'],
    ['+63-917-123-4567', '09171234567'],
    ['+63 0917 123 4567', '09171234567'],
    ['(+63) 917 123 4567', '09171234567'],
  ])('turns the country-code form %j into the 09 form', (raw, expected) => {
    expect(sanitizePhone(raw)).toBe(expected);
  });

  it('leaves a short country-code prefix alone while it is still being typed', () => {
    expect(sanitizePhone('+63')).toBe('63');
    expect(sanitizePhone('6391712345')).toBe('6391712345');
  });

  it('keeps at most eleven digits', () => {
    expect(sanitizePhone('09171234567890')).toBe('09171234567');
    expect(sanitizePhone('0917123456789')).toBe('09171234567');
  });

  it('exposes a native input cap large enough for a pasted +63 number', () => {
    expect(PHONE_INPUT_MAX_LENGTH).toBeGreaterThanOrEqual('+63 917 123 4567'.length);
  });
});

describe('validatePhone', () => {
  it.each(['09171234567', '09990000000', '09000000000', '09999999999'])('accepts %s', (phone) => {
    expect(validatePhone(phone)).toBeNull();
  });

  it('accepts a stored value with surrounding spaces, because saving trims it', () => {
    expect(validatePhone(' 09171234567 ')).toBeNull();
  });

  it.each([
    ['0917123456', 'ten digits'],
    ['091712345678', 'twelve digits'],
    ['9171234567', 'missing the leading 0'],
    ['19171234567', 'not starting with 09'],
    ['08171234567', 'starting with 08'],
    ['+639171234567', 'the +63 form is not stored'],
    ['0917 123 4567', 'spaces are not stored'],
    ['0917123456a', 'a letter'],
    ['09171234567\n5', 'a line break'],
  ])('refuses %s (%s) with the format message', (phone) => {
    expect(validatePhone(phone)).toBe(PHONE_FORMAT);
  });

  it('allows an empty phone when it is optional', () => {
    expect(validatePhone('')).toBeNull();
    expect(validatePhone('   ')).toBeNull();
    expect(validatePhone(undefined)).toBeNull();
    expect(validatePhone(null)).toBeNull();
  });

  it('asks for a phone when it is required, including when only spaces were typed', () => {
    expect(validatePhone('', { required: true })).toBe('Phone number is required');
    expect(validatePhone('   ', { required: true })).toBe('Phone number is required');
  });
});

describe('normalizeName', () => {
  it.each([
    ['  Ana   Reyes  ', 'Ana Reyes'],
    ['Juan\tDela\nCruz', 'Juan Dela Cruz'],
    ['   ', ''],
    ['', ''],
    ['José', 'José'],
    [undefined, ''],
  ])('turns %j into %j', (raw, expected) => {
    expect(normalizeName(raw as string)).toBe(expected);
  });
});

describe('validateFullName', () => {
  it.each([
    'Ana',
    'Jo',
    'José María',
    'Ñoel Peña',
    "O'Brien",
    'D’Angelo',
    'Mary-Jane Smith',
    'Juan Santos Jr.',
    'Ángel Núñez',
    'Ana\tReyes',
    'a'.repeat(120),
  ])('accepts %j', (name) => {
    expect(validateFullName(name)).toBeNull();
  });

  it.each(['', '   ', '\t\n'])('asks for a name when only spaces or nothing is typed (%j)', (name) => {
    expect(validateFullName(name)).toBe('Enter your full name');
  });

  it('needs at least two characters', () => {
    expect(validateFullName('A')).toBe('Full name must be at least 2 characters');
    expect(validateFullName(' A ')).toBe('Full name must be at least 2 characters');
  });

  it('caps the name at 120 characters after trimming', () => {
    expect(validateFullName('a'.repeat(121))).toBe('Full name must be 120 characters or fewer');
    expect(validateFullName(`  ${'a'.repeat(120)}  `)).toBeNull();
  });

  it.each(['Ana1', 'Ana 2', '2024', 'Test User 02'])('refuses digits in %j', (name) => {
    expect(validateFullName(name)).toBe("Full name can't include numbers");
  });

  it.each(['Ana@Reyes', 'Ana_Reyes', 'Ana #', 'Ana/Reyes', '(Ana)', 'Ana,Reyes', 'Ana😀', '😀', 'Ana!'])(
    'refuses symbols and emoji in %j',
    (name) => {
      expect(validateFullName(name)).toBe(NAME_CHARACTERS);
    },
  );

  it('refuses a name with no letter in it', () => {
    expect(validateFullName('-')).toBe('Full name must include a letter');
    expect(validateFullName('. .')).toBe('Full name must include a letter');
    expect(validateFullName("''")).toBe('Full name must include a letter');
  });

  it('refuses scripts outside Latin letters, which the rule does not cover', () => {
    expect(validateFullName('Иван Петров')).toBe(NAME_CHARACTERS);
  });
});

describe('validateCity', () => {
  it.each(['Cebu', 'Lipa', 'Quezon City', 'Lapu-Lapu City', 'Dela Paz', 'Ñaga', 'Batangas'])(
    'accepts %j, including short Philippine city names',
    (city) => {
      expect(validateCity(city)).toBeNull();
    },
  );

  it('allows an empty city when it is optional', () => {
    expect(validateCity('')).toBeNull();
    expect(validateCity('   ')).toBeNull();
  });

  it('asks for a city when it is required', () => {
    expect(validateCity('', { required: true })).toBe('Enter your city');
    expect(validateCity('  ', { required: true })).toBe('Enter your city');
  });

  it('refuses one letter, digits, symbols and a value over 80 characters', () => {
    expect(validateCity('C')).toBe('City must be at least 2 characters');
    expect(validateCity('Lipa 2')).toBe("City can't include numbers");
    expect(validateCity('Makati!')).toBe('City can only use letters, spaces, hyphens, apostrophes and periods');
    expect(validateCity('a'.repeat(81))).toBe('City must be 80 characters or fewer');
  });
});

describe('normalizeEmail', () => {
  it('trims and lower-cases for comparison', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('validateEmail', () => {
  it.each([
    'ana@example.com',
    'ANA@EXAMPLE.COM',
    '  ana@example.com  ',
    'ana.reyes+tag@mail.example.ph',
    "o'brien@example.test",
    'a@b.co',
    'user_1@sub-domain.example.org',
    `${'a'.repeat(64)}@example.com`,
  ])('accepts %j', (email) => {
    expect(validateEmail(email)).toBeNull();
  });

  it.each(['', '   ', '\t'])('asks for an email when only spaces or nothing is typed (%j)', (email) => {
    expect(validateEmail(email)).toBe('Enter your email address');
  });

  it.each([
    'ana',
    'ana@',
    '@example.com',
    'ana@example',
    'ana@example.c',
    'ana example@x.com',
    'ana@@example.com',
    'ana..reyes@example.com',
    '.ana@example.com',
    'ana.@example.com',
    'ana@-example.com',
    'ana@example-.com',
    'ana@exa_mple.com',
    'ana@example.com.',
    'ñana@example.com',
    `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(250)}.com`,
  ])('refuses %j with the invalid message', (email) => {
    expect(validateEmail(email)).toBe('Enter a valid email address');
  });
});

describe('validateAddress', () => {
  it.each([
    'Blk 5 Lot 3, Sampaguita St.',
    'Lipa City',
    '12345',
    'HSSi Building, Lipa',
    '  Brgy. San Jose  ',
    'a'.repeat(200),
  ])('accepts %j', (address) => {
    expect(validateAddress(address)).toBeNull();
  });

  it('allows an empty address when it is optional, and asks for one when it is required', () => {
    expect(validateAddress('')).toBeNull();
    expect(validateAddress('   ', { required: true })).toBe('Enter your address');
  });

  it('uses the caller message when a required address is empty', () => {
    expect(validateAddress('  ', {
      required: true,
      requiredMessage: 'Enter your address so nearby jobs can be matched to you.',
    })).toBe('Enter your address so nearby jobs can be matched to you.');
  });

  it('needs five characters after trimming', () => {
    expect(validateAddress('Lipa')).toBe('Address must be at least 5 characters');
    expect(validateAddress('  Lipa  ')).toBe('Address must be at least 5 characters');
  });

  it('caps the address at 200 characters', () => {
    expect(validateAddress('a'.repeat(201))).toBe('Address must be 200 characters or fewer');
  });

  it('needs a letter or a number', () => {
    expect(validateAddress('.....')).toBe('Address must include a letter or number');
  });
});

describe('validatePasswordRules', () => {
  it('keeps the eight-character minimum', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(validatePasswordRules('1234567')).toBe('Password must be at least 8 characters.');
    expect(validatePasswordRules('')).toBe('Password must be at least 8 characters.');
    expect(validatePasswordRules('12345678')).toBeNull();
  });

  it('labels the message for the field it is checking', () => {
    expect(validatePasswordRules('short', 'New password')).toBe('New password must be at least 8 characters.');
  });

  it('refuses a password made only of spaces, even when it is long enough', () => {
    expect(validatePasswordRules('        ')).toBe("Password can't be only spaces.");
    expect(validatePasswordRules('        ', 'New password')).toBe("New password can't be only spaces.");
  });

  it('accepts spaces inside a password that also has other characters', () => {
    expect(validatePasswordRules('abc      ')).toBeNull();
    expect(validatePasswordRules(' correct horse ')).toBeNull();
  });
});

describe('validateNewPasswordDiffers', () => {
  it('refuses a new password that is the same as the current one', () => {
    expect(validateNewPasswordDiffers('oldpassword1', 'oldpassword1')).toBe(
      "Choose a password you haven't used here",
    );
  });

  it('compares exactly, so a changed capital letter counts as different', () => {
    expect(validateNewPasswordDiffers('password1', 'Password1')).toBeNull();
    expect(validateNewPasswordDiffers('password1', 'password1 ')).toBeNull();
  });

  it('does not decide anything while one of the two is still empty', () => {
    expect(validateNewPasswordDiffers('', 'newpassword1')).toBeNull();
    expect(validateNewPasswordDiffers('oldpassword1', '')).toBeNull();
  });
});

describe('sanitizeOtp and validateOtpCode', () => {
  it('is six digits', () => {
    expect(OTP_LENGTH).toBe(6);
  });

  it.each([
    ['482 931', '482931'],
    ['48-29-31-99', '482931'],
    ['', ''],
    ['abc', ''],
    ['12345678', '123456'],
  ])('sanitizes %j to %j', (raw, expected) => {
    expect(sanitizeOtp(raw)).toBe(expected);
  });

  it('accepts exactly six digits', () => {
    expect(validateOtpCode('482931')).toBeNull();
    expect(validateOtpCode(' 482931 ')).toBeNull();
  });

  it.each(['', '   ', '48293', '4829311', '48a931', '482 931'])('refuses %j', (code) => {
    expect(validateOtpCode(code)).toBe('Enter the 6-digit code from your email');
  });
});

describe('validateServiceRadius', () => {
  it('leaves an empty radius alone, so the stored value is kept', () => {
    expect(validateServiceRadius('')).toBeNull();
    expect(validateServiceRadius('   ')).toBeNull();
  });

  it.each(['0.5', '1', '8', '25', '1000'])('accepts %s km', (km) => {
    expect(validateServiceRadius(km)).toBeNull();
  });

  it.each(['0', '0.4', '1000.1', '1001', '5.', 'abc', '-3'])('refuses %s km', (km) => {
    expect(validateServiceRadius(km)).toBe('Enter a service radius from 0.5 to 1000 km');
  });
});
