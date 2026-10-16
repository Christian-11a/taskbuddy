-- Keep enum creation separate from the migration that writes this new value.
alter type public.notification_type add value if not exists 'admin_alert';
