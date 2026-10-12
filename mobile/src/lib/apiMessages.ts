/**
 * The API's validation messages, in plain words.
 *
 * The server checks each request with class-validator, and its default messages
 * are technical: "full_name must be shorter than or equal to 120 characters".
 * friendlyApiMessage rewrites that output into the sentence a person would write,
 * naming the field the way its form labels it, but only for the rules listed in
 * RULES. Anything else passes through as it was sent: a sentence the backend wrote
 * itself ("Insufficient wallet balance") is already plain, and validator output with
 * a rule that is not listed ("app_redirect is not an allowed URI") carries the
 * server's own explanation, which a generic sentence would hide.
 *
 * Pure, with no network or React, so every pattern is tested on its own.
 */

/** The labels the forms use, keyed by the field name the API sends. */
const FIELD_LABELS = new Map<string, string>([
  ['full_name', 'Full name'],
  ['name', 'Name'],
  ['email', 'Email'],
  ['phone', 'Phone number'],
  ['password', 'Password'],
  ['new_password', 'New password'],
  ['current_password', 'Current password'],
  ['address', 'Address'],
  ['city', 'City'],
  ['bio', 'Bio'],
  ['service_radius_km', 'Service radius'],
  ['years_experience', 'Years of experience'],
  ['category_id', 'Service'],
  ['title', 'Title'],
  ['description', 'Description'],
  ['tasks', 'Tasks'],
  ['budget', 'Budget'],
  ['amount', 'Amount'],
  ['caption', 'Caption'],
  ['reason', 'Reason'],
  ['note', 'Note'],
  ['details', 'Details'],
  ['comment', 'Comment'],
  ['body', 'Message'],
  ['message', 'Message'],
  ['cover_message', 'Message'],
  ['destination', 'Destination'],
  ['token', 'Code'],
  ['latitude', 'Location'],
  ['longitude', 'Location'],
  ['location', 'Location'],
]);

/** Fields that hold pesos, so their limits read as ₱ amounts. */
const PESO_FIELDS = new Set(['budget', 'amount']);

/** A sentence the backend wrote itself: it opens with a capital and has more than one word. */
function isSentence(text: string): boolean {
  return /^[A-Z]/.test(text) && /\s/.test(text);
}

/** class-validator's shape: a field name, then a rule phrase such as "must be" or "should not be". */
const VALIDATOR_MESSAGE = /^(?:each value in )?([a-z_][\w.[\]]*)\s+((?:must|should|is|has|can|contains|needs)\b.*)$/;

/** The field's name, as its form labels it: the last name in a path, without list indexes. */
function fieldKey(field: string): string {
  const names = field
    .replace(/\[\d+\]/g, '')
    .split('.')
    .filter((name) => name !== '' && !/^\d+$/.test(name));
  return names[names.length - 1] ?? field;
}

/** The form's label for a field, or its name in words when the table does not know it. */
function labelFor(key: string): string {
  const known = FIELD_LABELS.get(key);
  if (known) return known;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Digits with thousands separators, as people write them: "100000" reads "100,000". */
function withSeparators(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

type Phrase = (
  label: string,
  amount: (figure: string) => string,
  match: RegExpExecArray,
) => string;

/**
 * The rules this module can put in plain words, tried in order. Each pattern
 * matches the rule phrase after the field name, and returns the sentence to show.
 */
const RULES: ReadonlyArray<readonly [RegExp, Phrase]> = [
  [/^must be longer than or equal to 1 characters?$/, (label) => `${label} is required.`],
  [/^must be longer than or equal to (\d+) characters?$/, (label, _amount, match) => `${label} must be at least ${match[1]} characters.`],
  [/^must be shorter than or equal to (\d+) characters?$/, (label, _amount, match) => `${label} must be ${match[1]} characters or fewer.`],
  [
    /^must be longer than or equal to (\d+) and shorter than or equal to (\d+) characters$/,
    (label, _amount, match) => `${label} must be between ${match[1]} and ${match[2]} characters.`,
  ],
  [/^must be an email$/, () => 'Enter a valid email address.'],
  [/^must be an? integer number$/, (label) => `${label} must be a whole number.`],
  [/^must be an? positive number$/, (label) => `${label} must be greater than zero.`],
  [/^must be an? negative number$/, (label) => `${label} must be less than zero.`],
  [/^must not be less than (-?\d+(?:\.\d+)?)$/, (label, amount, match) => `${label} must be at least ${amount(match[1])}.`],
  [/^must not be greater than (-?\d+(?:\.\d+)?)$/, (label, amount, match) => `${label} must be ${amount(match[1])} or less.`],
  [/^should not be empty$/, (label) => `${label} is required.`],
  [/^must be a number(?: conforming to the specified constraints)?$/, (label) => `${label} must be a number.`],
  [/^is not a valid decimal number\.?$/, (label) => `${label} must be a number.`],
  [/^must be a valid phone number$/, (label) => `Enter a valid ${label.toLowerCase()}.`],
  [/^must be a valid ISO 8601 date string$/, (label) => `${label} isn't a valid date.`],
  [
    /^must contain no more than (\d+) elements?$/,
    (label, _amount, match) => `${label} can have up to ${match[1]} ${match[1] === '1' ? 'item' : 'items'}.`,
  ],
  [
    /^must contain at least (\d+) elements?$/,
    (label, _amount, match) => `${label} must have at least ${match[1]} ${match[1] === '1' ? 'item' : 'items'}.`,
  ],
  [/^must be one of the following values: .+$/, (label) => `Choose a valid ${label.toLowerCase()}.`],
  [/^must be a (?:latitude|longitude) string or number$/, () => "The location isn't valid."],
  [/^must match .+ regular expression$/, (label) => `${label} isn't in the right format.`],
  [/^must be an? (?:string|boolean value|array|object|UUID)$/, (label) => `${label} isn't valid.`],
  [/^must be a URL address$/, (label) => `${label} isn't a valid web address.`],
];

/** The plain sentence for one rule on one field, or null when the rule has no wording here. */
function plainRule(field: string, rule: string): string | null {
  const key = fieldKey(field);
  const label = labelFor(key);
  const amount = (figure: string) => `${PESO_FIELDS.has(key) ? '₱' : ''}${withSeparators(figure)}`;
  for (const [pattern, phrase] of RULES) {
    const match = pattern.exec(rule);
    if (match) return phrase(label, amount, match);
  }
  return null;
}

/**
 * The message as a person should read it. Validator output whose rule is listed in
 * RULES is rewritten into a plain sentence. Everything else comes back exactly as the
 * server sent it: the backend's own sentences, validator output with a rule this
 * module has no wording for, and anything that is not validator output.
 */
export function friendlyApiMessage(raw: string): string {
  if (raw === '' || isSentence(raw)) return raw;
  const match = VALIDATOR_MESSAGE.exec(raw);
  if (!match) return raw;
  const [, field, rule] = match;
  return plainRule(field, rule) ?? raw;
}
