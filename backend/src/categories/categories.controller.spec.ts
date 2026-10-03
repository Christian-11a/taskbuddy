import { CategoriesController } from './categories.controller';
import type { SupabaseService } from '../supabase/supabase.service';

describe('CategoriesController', () => {
  it('returns the active categories for provider sign-up', async () => {
    const rows = [{ id: 6, name: 'Electrical' }];
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const supabase = {
      admin: { from: jest.fn().mockReturnValue(query) },
    } as unknown as SupabaseService;

    await expect(new CategoriesController(supabase).list()).resolves.toEqual(
      rows,
    );
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
  });
});
