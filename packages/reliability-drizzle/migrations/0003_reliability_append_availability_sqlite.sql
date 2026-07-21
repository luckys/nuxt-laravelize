alter table reliability_messages add column append_available_at text;
update reliability_messages set append_available_at = available_at where append_available_at is null;
