import { BadRequestException } from '@nestjs/common';
import { cleanCommentBody, COMMENT_MAX_LENGTH } from './video-engagement.service.js';

describe('cleanCommentBody', () => {
  it('trims surrounding whitespace', () => {
    expect(cleanCommentBody('  ແຊບຫຼາຍ!  ')).toBe('ແຊບຫຼາຍ!');
  });

  it('rejects empty and whitespace-only comments', () => {
    expect(() => cleanCommentBody('   \n ')).toThrow(BadRequestException);
  });

  it('rejects comments over the limit', () => {
    expect(() => cleanCommentBody('a'.repeat(COMMENT_MAX_LENGTH + 1))).toThrow(BadRequestException);
    expect(cleanCommentBody('a'.repeat(COMMENT_MAX_LENGTH))).toHaveLength(COMMENT_MAX_LENGTH);
  });
});
