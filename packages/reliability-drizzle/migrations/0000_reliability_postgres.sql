create table if not exists reliability_messages (
  id varchar(128) not null, kind varchar(16) not null check (kind in ('outbox','inbox')), message_type varchar(128) not null,
  envelope jsonb not null, state varchar(16) not null check (state in ('pending','processing','delivered','dead')),
  attempts integer not null default 0, available_at timestamptz not null, lease_owner varchar(128), lease_token varchar(300), lease_until timestamptz, last_error varchar(512),
  primary key (kind, id), check ((lease_owner is null) = (lease_until is null)), check ((lease_token is null) = (lease_until is null))
);
create index if not exists reliability_messages_claim_idx on reliability_messages (kind, message_type, state, available_at, lease_until);
