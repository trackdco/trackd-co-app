-- Verify 013 landed. Every row should read OK.
select 'stacks.effective_from' as check,
       case when count(*) = 1 then 'OK' else 'MISSING' end as result,
       coalesce(string_agg(is_nullable || ' / default ' || coalesce(column_default,'none'), ''), '') as detail
from information_schema.columns
where table_name = 'stacks' and column_name = 'effective_from'
union all
select 'stack_members spans',
       case when count(*) = 2 then 'OK' else 'MISSING (' || count(*) || '/2)' end,
       string_agg(column_name, ', ' order by column_name)
from information_schema.columns
where table_name = 'stack_members' and column_name in ('effective_from','effective_to')
union all
select 'backfill: no null dates',
       case when count(*) = 0 then 'OK' else count(*) || ' NULL rows' end, ''
from stack_members where effective_from is null
union all
select 'PK is the surrogate id',
       case when count(*) = 1 then 'OK' else 'NOT SWAPPED' end, ''
from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
where i.indrelid = 'stack_members'::regclass and i.indisprimary and a.attname = 'id'
union all
select 'one-stack rule is PARTIAL',
       case when count(*) = 1 then 'OK' else 'WRONG INDEX' end, ''
from pg_indexes where tablename = 'stack_members'
  and indexname = 'stack_members_one_current_stack_per_compound'
  and indexdef ilike '%where (effective_to IS NULL)%'
union all
select 'old GLOBAL index is gone',
       case when count(*) = 0 then 'OK' else 'STILL PRESENT' end, ''
from pg_indexes where tablename = 'stack_members'
  and indexname = 'stack_members_one_stack_per_compound'
union all
select 'span CHECK present',
       case when count(*) = 1 then 'OK' else 'MISSING' end, ''
from pg_constraint
where conrelid = 'stack_members'::regclass and conname = 'stack_members_span_valid'
union all
select 'your stacks',
       count(*)::text || ' stack(s)',
       coalesce(string_agg(name || ' from ' || effective_from, '; ' order by effective_from), 'none')
from stacks;
