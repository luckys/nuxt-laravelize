create table if not exists reliability_messages (
  id text not null, kind text not null check (kind in ('outbox','inbox')), message_type text not null,
  envelope text not null, state text not null check (state in ('pending','processing','delivered','dead')),
  attempts integer not null default 0, available_at text not null, lease_owner text, lease_token text, lease_until text, last_error text,
  primary key (kind, id), check ((lease_owner is null) = (lease_until is null)), check ((lease_token is null) = (lease_until is null))
);
create index if not exists reliability_messages_claim_idx on reliability_messages (kind, message_type, state, available_at, lease_until);
