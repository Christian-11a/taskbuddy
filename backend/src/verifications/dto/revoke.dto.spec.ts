import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevokeVerificationDto } from './verifications.dto';
import { ListAuditQueryDto } from '../../admin/dto/admin.dto';

const check = (body: unknown) =>
  validate(plainToInstance(RevokeVerificationDto, body), { whitelist: true });

describe('RevokeVerificationDto', () => {
  it('accepts a reason of 10 to 500 characters, trimmed', async () => {
    const dto = plainToInstance(RevokeVerificationDto, {
      reason: '   Certificate number is fake   ',
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.reason).toBe('Certificate number is fake');
  });

  it.each([
    ['missing', {}],
    ['too short after trimming', { reason: '   short    ' }],
    ['too long', { reason: 'x'.repeat(501) }],
    ['not text', { reason: 12345678901 }],
  ])('rejects a reason that is %s', async (_name, body) => {
    expect((await check(body)).length).toBeGreaterThan(0);
  });
});

describe('ListAuditQueryDto target_id', () => {
  it('accepts a UUID and rejects anything else', async () => {
    const ok = plainToInstance(ListAuditQueryDto, {
      target_id: '3f2c1d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    });
    await expect(validate(ok)).resolves.toEqual([]);
    const bad = plainToInstance(ListAuditQueryDto, { target_id: 'abc' });
    expect((await validate(bad)).length).toBeGreaterThan(0);
  });
});
