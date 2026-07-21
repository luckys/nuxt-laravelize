alter table reliability_messages add column if not exists append_available_at timestamptz;
update reliability_messages set append_available_at = available_at where append_available_at is null;
alter table reliability_messages alter column append_available_at set not null;
