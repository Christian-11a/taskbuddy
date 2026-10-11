import { friendlyApiMessage } from '../apiMessages';

const GENERIC = 'Please check your entries and try again.';

describe('friendlyApiMessage: length rules', () => {
  it.each([
    ['full_name must be shorter than or equal to 120 characters', 'Full name must be 120 characters or fewer.'],
    ['bio must be longer than or equal to 20 characters', 'Bio must be at least 20 characters.'],
    ['new_password must be longer than or equal to 8 characters', 'New password must be at least 8 characters.'],
    ['caption must be longer than or equal to 1 characters', 'Caption is required.'],
    [
      'reason must be longer than or equal to 10 and shorter than or equal to 500 characters',
      'Reason must be between 10 and 500 characters.',
    ],
    ['destination must be shorter than or equal to 200 characters', 'Destination must be 200 characters or fewer.'],
  ])('%s', (raw, plain) => {
    expect(friendlyApiMessage(raw)).toBe(plain);
  });
});

describe('friendlyApiMessage: other class-validator rules', () => {
  it.each([
    ['email must be an email', 'Enter a valid email address.'],
    ['budget must be a positive number', 'Budget must be greater than zero.'],
    ['budget must be a negative number', 'Budget must be less than zero.'],
    ['phone must be a string', "Phone number isn't valid."],
    ['phone must be a valid phone number', 'Enter a valid phone number.'],
    ['budget must be a number conforming to the specified constraints', 'Budget must be a number.'],
    ['budget must be a number', 'Budget must be a number.'],
    ['budget is not a valid decimal number.', 'Budget must be a number.'],
    ['years_experience must be an integer number', 'Years of experience must be a whole number.'],
    ['tasks must contain no more than 20 elements', 'Tasks can have up to 20 items.'],
    ['tasks must contain at least 1 elements', 'Tasks must have at least 1 item.'],
    ['tasks must contain at least 3 elements', 'Tasks must have at least 3 items.'],
    ['category_id must be one of the following values: 1, 2, 3', 'Choose a valid service.'],
    ['latitude must be a latitude string or number', "The location isn't valid."],
    ['location_reference must match /^x+$/ regular expression', "Location reference isn't in the right format."],
    ['start_date must be a valid ISO 8601 date string', "Start date isn't a valid date."],
    ['active must be a boolean value', "Active isn't valid."],
    ['tags must be an array', "Tags isn't valid."],
    ['profile must be an object', "Profile isn't valid."],
    ['id must be a UUID', "Id isn't valid."],
    ['website must be a URL address', "Website isn't a valid web address."],
    ['phone should not be empty', 'Phone number is required.'],
    ['each value in tasks must be a string', "Tasks isn't valid."],
  ])('%s', (raw, plain) => {
    expect(friendlyApiMessage(raw)).toBe(plain);
  });
});

describe('friendlyApiMessage: amounts and numbers read as people write them', () => {
  it.each([
    ['budget must not be greater than 100000', 'Budget must be ₱100,000 or less.'],
    ['amount must not be less than 50', 'Amount must be at least ₱50.'],
    ['service_radius_km must not be less than 0.5', 'Service radius must be at least 0.5.'],
    ['service_radius_km must not be greater than 1000', 'Service radius must be 1,000 or less.'],
  ])('%s', (raw, plain) => {
    expect(friendlyApiMessage(raw)).toBe(plain);
  });
});

describe('friendlyApiMessage: field names', () => {
  it.each([
    ['full_name should not be empty', 'Full name is required.'],
    ['phone should not be empty', 'Phone number is required.'],
    ['service_radius_km should not be empty', 'Service radius is required.'],
    ['years_experience should not be empty', 'Years of experience is required.'],
    ['cover_message should not be empty', 'Message is required.'],
  ])('uses the form label for %s', (raw, plain) => {
    expect(friendlyApiMessage(raw)).toBe(plain);
  });

  it('turns a field the table does not know into words, from snake_case or camelCase', () => {
    expect(friendlyApiMessage('favourite_colour should not be empty')).toBe('Favourite colour is required.');
    expect(friendlyApiMessage('startDate should not be empty')).toBe('Start date is required.');
  });

  it('reads a dotted or indexed path by its last name', () => {
    expect(friendlyApiMessage('profile.full_name should not be empty')).toBe('Full name is required.');
    expect(friendlyApiMessage('address[0] should not be empty')).toBe('Address is required.');
  });
});

describe('friendlyApiMessage: fallback for validator output it does not know', () => {
  it('uses the generic sentence for a rule with no plain wording', () => {
    expect(friendlyApiMessage('full_name must do something unusual')).toBe(GENERIC);
  });

  it('uses the generic sentence for a property the server does not accept', () => {
    expect(friendlyApiMessage('property extra should not exist')).toBe(GENERIC);
  });
});

describe('friendlyApiMessage: messages the backend wrote as sentences pass through unchanged', () => {
  it.each([
    'Insufficient wallet balance',
    'Email already registered',
    'Internal server error',
    'Withdrawal is already being processed.',
    'This account still has obligations in flight',
    'Your wallet still holds PHP 8,397.00. Withdraw it before deleting your account.',
    'Current password is incorrect',
    'Unauthorized',
  ])('%s', (raw) => {
    expect(friendlyApiMessage(raw)).toBe(raw);
  });

  it('leaves a lower-case message that is not validator output as it was sent', () => {
    expect(friendlyApiMessage('email already registered')).toBe('email already registered');
    expect(friendlyApiMessage('something weird must happen')).toBe('something weird must happen');
  });

  it('returns an empty message as it was', () => {
    expect(friendlyApiMessage('')).toBe('');
  });
});
