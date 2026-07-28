alter table reliability_dead_letter_operations drop constraint reliability_dead_letter_operations_source_check;
alter table reliability_dead_letter_operations drop constraint reliability_dead_letter_operations_check;
alter table reliability_dead_letter_operations alter column source drop not null;
alter table reliability_dead_letter_operations alter column message_kind drop not null;
alter table reliability_dead_letter_operations alter column message_id drop not null;
alter table reliability_dead_letter_operations alter column action drop not null;
alter table reliability_dead_letter_operations alter column result_revision type text using result_revision::text;
alter table reliability_dead_letter_operations add constraint reliability_dead_letter_operations_terminal_check check (
  (status = 'pending' and resolved_at is null and result_revision is null and result_disposition is null and failure_code is null)
  or (status = 'committed' and resolved_at is not null and source is not null and message_kind is not null and message_id is not null and result_revision is not null and result_disposition is not null and failure_code is null)
  or (status = 'failed' and resolved_at is not null and result_revision is null and result_disposition is null and failure_code is not null)
);
