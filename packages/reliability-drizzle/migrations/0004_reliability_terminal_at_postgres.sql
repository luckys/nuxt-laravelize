alter table reliability_messages add column if not exists terminal_at timestamptz;
create index if not exists reliability_messages_terminal_idx on reliability_messages (kind, message_type, state, terminal_at, id) where terminal_at is not null;
create index if not exists reliability_messages_terminal_untyped_idx on reliability_messages (kind, state, terminal_at, id) where terminal_at is not null;
