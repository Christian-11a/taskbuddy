import { UPLOAD_BUCKETS, CHAT_ATTACHMENTS_BUCKET } from './uploads.constants';

describe('uploads.constants', () => {
  it('includes chat-attachments as an issuable bucket', () => {
    expect(UPLOAD_BUCKETS).toContain('chat-attachments');
    expect(CHAT_ATTACHMENTS_BUCKET).toBe('chat-attachments');
  });
});
