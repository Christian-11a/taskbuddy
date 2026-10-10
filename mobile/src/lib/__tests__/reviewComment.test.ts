import {
  REVIEW_COMMENT_MAX,
  REVIEW_TAGS,
  orderedTags,
  reviewCommentFor,
  reviewCommentLimit,
} from '../reviewComment';

describe('review tags and the comment they become', () => {
  it('offers the five quick tags in the order they are shown', () => {
    expect(REVIEW_TAGS).toEqual(['On time', 'Friendly', 'Clean work', 'Fair price', 'Explained clearly']);
  });

  it('puts the chosen tags in list order, whatever order they were tapped in', () => {
    expect(orderedTags(['Friendly', 'On time'])).toEqual(['On time', 'Friendly']);
    expect(orderedTags([])).toEqual([]);
  });

  it('sends the comment as typed when no tag is chosen, and nothing when both are empty', () => {
    expect(reviewCommentFor([], '  Fixed it  ')).toBe('  Fixed it  ');
    expect(reviewCommentFor([], '')).toBeUndefined();
  });

  it('caps a comment sent without tags at the 500 characters the API accepts', () => {
    expect(REVIEW_COMMENT_MAX).toBe(500);
    expect(reviewCommentFor([], 'x'.repeat(600))).toBe('x'.repeat(500));
  });

  it('puts the tags first, joined with a middle dot, then the trimmed comment', () => {
    expect(reviewCommentFor(['On time', 'Friendly'], '  Fixed it fast ')).toBe('On time · Friendly · Fixed it fast');
  });

  it('sends the tags alone when the comment is blank', () => {
    expect(reviewCommentFor(['Clean work'], '   ')).toBe('Clean work');
  });

  it('keeps the tags whole and never sends more than 500 characters', () => {
    const tags = ['On time', 'Friendly'];
    const limit = reviewCommentLimit(tags);

    const sent = reviewCommentFor(tags, 'x'.repeat(600));

    expect(sent).toBe(`On time · Friendly · ${'x'.repeat(limit)}`);
    expect(sent!.length).toBeLessThanOrEqual(REVIEW_COMMENT_MAX);
  });

  it('leaves the comment box room for the tags in front of it', () => {
    expect(reviewCommentLimit([])).toBe(500);
    expect(reviewCommentLimit(['On time'])).toBe(500 - 'On time'.length - ' · '.length);
  });
});
