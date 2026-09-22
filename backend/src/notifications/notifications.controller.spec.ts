import { NotificationsController } from './notifications.controller';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

function createSupabaseMock() {
  const eq = jest.fn();
  const builder = { delete: jest.fn(() => builder), eq };
  eq.mockImplementation(() => builder);
  const from = jest.fn(() => builder);
  const supabase = { admin: { from } } as unknown as SupabaseService;
  return { supabase, from, builder, eq };
}

const user = { id: 'user-1' } as Profile;

describe('NotificationsController delete', () => {
  it('deletes one notification scoped to the caller', async () => {
    const { supabase, from, builder, eq } = createSupabaseMock();
    const controller = new NotificationsController(supabase);

    await controller.remove(user, 'n-1');

    expect(from).toHaveBeenCalledWith('notifications');
    expect(builder.delete).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'n-1');
    // Without this a caller could delete someone else's notification by id.
    expect(eq).toHaveBeenCalledWith('recipient_id', 'user-1');
  });

  it('clears only the caller’s notifications', async () => {
    const { supabase, eq } = createSupabaseMock();
    const controller = new NotificationsController(supabase);

    await controller.removeAll(user);

    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('recipient_id', 'user-1');
  });
});
