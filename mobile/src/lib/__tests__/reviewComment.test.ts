import {
  REVIEW_COMMENT_MAX,
  REVIEW_TAGS,
  orderedTags,
  reviewCommentFor,
  reviewCommentLength,
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

  it('sends the comment without the spaces around it when no tag is chosen, and nothing when it is empty', () => {
    expect(reviewCommentFor([], '  Fixed it  ')).toBe('Fixed it');
    expect(reviewCommentFor([], '')).toBeUndefined();
  });

  it('sends nothing for a comment that is only spaces or blank lines, with no tag', () => {
    expect(reviewCommentFor([], '   ')).toBeUndefined();
    expect(reviewCommentFor([], '\n\n\n\n')).toBeUndefined();
  });

  it('keeps the blank lines inside the comment as typed, and only changes the line endings', () => {
    expect(reviewCommentFor([], 'Great\n\n\n\nwork')).toBe('Great\n\n\n\nwork');
    expect(reviewCommentFor(['On time'], 'Great\r\n\r\n\r\nwork')).toBe('On time · Great\n\n\nwork');
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

  it('measures the review as reviewCommentFor sends it, when it fits', () => {
    const tags = ['On time', 'Friendly'];
    expect(reviewCommentLength(tags, '  Fixed it fast ')).toBe(reviewCommentFor(tags, '  Fixed it fast ')!.length);
    expect(reviewCommentLength([], '  Fixed it  ')).toBe(reviewCommentFor([], '  Fixed it  ')!.length);
  });

  it('measures the tags alone when the comment is blank, and nothing when neither is given', () => {
    expect(reviewCommentLength(['Clean work'], '   ')).toBe('Clean work'.length);
    expect(reviewCommentLength([], '')).toBe(0);
  });

  it('measures a comment past the limit in full, so the overflow can be shown and not cut', () => {
    expect(reviewCommentLength(['On time'], 'x'.repeat(600))).toBe('On time · '.length + 600);
    expect(reviewCommentLength([], 'x'.repeat(600))).toBe(600);
  });
});
