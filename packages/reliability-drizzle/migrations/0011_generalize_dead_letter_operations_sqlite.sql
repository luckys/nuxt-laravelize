drop index if exists reliability_dead_letter_operations_source_key_idx;
drop index if exists reliability_dead_letter_operations_retention_idx;
alter table reliability_dead_letter_operations rename to reliability_dead_letter_operations_legacy;
create table reliability_dead_letter_operations (
  operation_id text primary key,
  fingerprint text not null check (length(fingerprint) = 64 and fingerprint not glob '*[^0-9a-f]*'),
  source text,
  message_kind text,
  message_id text,
  action text check (action in ('retry','discard')),
  status text not null check (status in ('pending','committed','failed')),
  reserved_at text not null,
  resolved_at text,
  result_revision text,
  result_disposition text check (result_disposition in ('active','discarded')),
  failure_code text check (failure_code in ('not_found','stale_revision','invalid_state')),
  check ((status = 'pending' and resolved_at is null and result_revision is null and result_disposition is null and failure_code is null)
    or (status = 'committed' and resolved_at is not null and source is not null and message_kind is not null and message_id is not null and result_revision is not null and result_disposition is not null and failure_code is null)
    or (status = 'failed' and resolved_at is not null and result_revision is null and result_disposition is null and failure_code is not null))
);
insert into reliability_dead_letter_operations (operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at, resolved_at, result_revision, result_disposition, failure_code)
select operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at, resolved_at, cast(result_revision as text), result_disposition, failure_code from reliability_dead_letter_operations_legacy;
drop table reliability_dead_letter_operations_legacy;
create index reliability_dead_letter_operations_source_key_idx on reliability_dead_letter_operations (source, message_kind, message_id, reserved_at);
create index reliability_dead_letter_operations_retention_idx on reliability_dead_letter_operations (status, resolved_at);
