import { Logger } from '@nestjs/common';
import { PushScheduler } from './push.scheduler';
import type { SupabaseService } from '../supabase/supabase.service';
import type { PushService } from './push.service';
import type { SettingsService } from '../settings/settings.service';
function setup(error: { message: string } | null = null) {
  const row = {
    id: 'n1',
    recipient_id: 'p1',
    type: 'message',
    title: 'New message',
    body: 'Hello',
    data: {
      job_id: 'j1',
      conversation_id: 'c1',
      message_id: 'm1',
      recipient_id: 'foreign',
    },
  };
  const results = [{ data: [row], error }, { error: null }];
  const from = jest.fn(() => {
    const result = results.shift();
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'is', 'order', 'limit', 'update', 'in'])
      builder[method] = jest.fn(() => builder);
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return builder;
  });
  const push = {
    tokensFor: jest
      .fn()
      .mockResolvedValue(new Map([['p1', ['ExponentPushToken[device]']]])),
    send: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    pushEnabledAmong: jest.fn().mockResolvedValue(new Set(['p1'])),
  };
  return {
    scheduler: new PushScheduler(
      { admin: { from } } as unknown as SupabaseService,
      push as unknown as PushService,
      settings as unknown as SettingsService,
    ),
    push,
    settings,
  };
}
it('sends routing identifiers and trusted recipient context to registered opted-in devices', async () => {
  const { scheduler, push } = setup();
  await scheduler.tick();
  expect(push.send).toHaveBeenCalledWith([
    expect.objectContaining({
      data: expect.objectContaining({
        notification_id: 'n1',
        recipient_id: 'p1',
        job_id: 'j1',
        conversation_id: 'c1',
        message_id: 'm1',
      }),
    }),
  ]);
});
it('does not send to an account that opted out', async () => {
  const { scheduler, push, settings } = setup();
  settings.pushEnabledAmong.mockResolvedValue(new Set());
  await scheduler.tick();
  expect(push.send).not.toHaveBeenCalled();
});
it('reports persistence failures instead of treating a failed read as no notifications', async () => {
  const log = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});
  try {
    const { scheduler, push } = setup({ message: 'Database offline' });
    await scheduler.tick();
    expect(push.send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Notification read failed: Database offline'),
    );
  } finally {
    log.mockRestore();
  }
});
