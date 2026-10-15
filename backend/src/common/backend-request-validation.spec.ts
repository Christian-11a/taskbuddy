import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto, LoginDto } from '../auth/dto/auth.dto';
import { CreateJobDto } from '../jobs/dto/jobs.dto';
import { RequestWithdrawalDto } from '../wallet/dto/wallet.dto';
import { UpdateProfileDto } from '../profiles/dto/profiles.dto';

const errors = async (cls: new () => object, value: object) =>
  validate(plainToInstance(cls, value));

describe('post-UAT server validation', () => {
  const signup = {
    email: 'new@test.com',
    password: 'Password123',
    role: 'provider',
    full_name: 'Test Provider',
    category_id: 1,
    consented_terms: true,
    consented_privacy: true,
    consented_data_collection: true,
  };
  it('requires provider category and consent on new registrations', async () => {
    expect(await errors(RegisterDto, signup)).toHaveLength(0);
    expect(
      await errors(RegisterDto, { ...signup, category_id: undefined }),
    ).not.toHaveLength(0);
    expect(
      await errors(RegisterDto, { ...signup, consented_terms: false }),
    ).not.toHaveLength(0);
  });
  it('keeps existing numeric-only passwords valid for login', async () => {
    expect(
      await errors(LoginDto, { email: 'uat@test.com', password: '11111111' }),
    ).toHaveLength(0);
    expect(
      await errors(RegisterDto, { ...signup, password: '11111111' }),
    ).not.toHaveLength(0);
  });
  it('caps job budgets and withdrawal amounts', async () => {
    const withdrawalErrors = await errors(RequestWithdrawalDto, {
      amount: 0.5,
      destination: 'GCash 09123456789',
    });
    expect(withdrawalErrors[0].constraints).toHaveProperty(
      'min',
      'Withdrawal amount must be at least ₱1.',
    );
    const job = {
      category_id: 1,
      title: 'Fix the tap',
      description: 'Repair the leaking kitchen faucet carefully.',
      address: 'De La Salle Lipa',
      latitude: 13.94,
      longitude: 121.14,
      budget: 100001,
    };
    expect(
      (await errors(CreateJobDto, job)).find(
        (error) => error.property === 'budget',
      )?.constraints,
    ).toHaveProperty('max', 'Budget must be between ₱1 and ₱100,000.');
  });
  it('returns field-specific messages for signup and profile input', async () => {
    const invalidSignup = await errors(RegisterDto, {
      ...signup,
      password: '11111111',
      category_id: undefined,
      consented_terms: false,
    });
    expect(
      invalidSignup.find((error) => error.property === 'password')?.constraints,
    ).toHaveProperty(
      'matches',
      'Password must contain at least one letter and one number.',
    );
    expect(
      invalidSignup.find((error) => error.property === 'category_id')
        ?.constraints,
    ).toHaveProperty(
      'isInt',
      'Choose a service category to register as a provider.',
    );
    expect(
      invalidSignup.find((error) => error.property === 'consented_terms')
        ?.constraints,
    ).toHaveProperty('equals', 'Accept the Terms and Conditions to continue.');
    const profileErrors = await errors(UpdateProfileDto, {
      phone: '123',
      city: 'X',
    });
    expect(
      profileErrors.find((error) => error.property === 'phone')?.constraints,
    ).toHaveProperty(
      'matches',
      'Phone number must be an 11-digit Philippine mobile number starting with 09.',
    );
    expect(
      profileErrors.find((error) => error.property === 'city')?.constraints,
    ).toHaveProperty('isLength', 'City must be 2–80 characters.');
  });
});
