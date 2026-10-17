import {
  cleanSearch,
  containsPattern,
  escapeLike,
  likeSearchParam,
  postgrestQuote,
} from './sanitize';

describe('sanitize', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('quotes PostgREST filter values so commas and parens stay literal', () => {
    expect(postgrestQuote('a,b),email.eq.x')).toBe('"a,b),email.eq.x"');
    expect(postgrestQuote('say "hi"\\')).toBe('"say \\"hi\\"\\\\"');
  });

  it('builds a quoted contains pattern', () => {
    expect(containsPattern("O'Brien, 100%")).toBe('"%O\'Brien, 100\\\\%%"');
  });

  it('strips control characters and empty input', () => {
    expect(cleanSearch('  Ra\u0000mos\n ')).toBe('Ramos');
    expect(cleanSearch(' \t ')).toBeNull();
    expect(cleanSearch(undefined)).toBeNull();
  });

  it('leaves SQL-looking text as plain data', () => {
    expect(likeSearchParam("'; drop table jobs; --")).toBe(
      "'; drop table jobs; --",
    );
    expect(likeSearchParam('_')).toBe('\\_');
  });
});
