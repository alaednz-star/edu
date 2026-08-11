-- ==================================================================
-- Resources: retire `is_important` in favour of `pinned`
--
-- SEPARATE from the Phase 1 migration on purpose. Phase 1 added `pinned` and
-- backfilled it; this is the contract half, and dropping a column is the one
-- irreversible thing in the whole phase.
--
-- ORDERING MATTERS. Apply this only AFTER the application code that stopped
-- reading and writing `is_important` is live. Both halves are in the same commit,
-- but if the migration reaches the database before the new bundle reaches
-- browsers, a teacher still running the old JavaScript sends `is_important` on
-- create and gets a 400. The window is a deploy, not a day, and the safe order
-- costs nothing: deploy, then push this.
--
-- Why it is safe to drop at all -- checked, not assumed:
--   * no policy, index, view, function, constraint, trigger or generated column
--     references it (verified against the migrated database, 0 rows)
--   * `pinned` equals `is_important` on every row (verified, 0 differences)
--   * nothing in `src/` reads or writes it (verified by search)
--
-- Reversal, if ever needed: re-add the column and backfill from `pinned`.
--   alter table public.resources add column is_important boolean not null default false;
--   update public.resources set is_important = pinned;
-- The data survives in `pinned`, so this is recoverable -- which is the only
-- reason a drop is acceptable here.
-- ==================================================================

-- Guard: refuse to drop while the two columns disagree, which would mean the
-- Phase 1 backfill was skipped or something wrote `is_important` afterwards.
do $$
declare _n integer;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'resources' and column_name = 'is_important'
  ) then
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'resources' and column_name = 'pinned'
    ) then
      raise exception '`pinned` is missing; apply 20260811100000 first';
    end if;

    select count(*) into _n from public.resources where pinned is distinct from is_important;
    if _n <> 0 then
      raise exception '% resources disagree between pinned and is_important; reconcile before dropping', _n;
    end if;
  end if;
end $$;

alter table public.resources drop column if exists is_important;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'resources' and column_name = 'is_important'
  ) then
    raise exception 'is_important is still present';
  end if;
  raise notice 'is_important retired; pinned is the only importance flag.';
end $$;

comment on column public.resources.pinned is
  'Teacher-flagged as important. The only importance flag -- `is_important` was retired in 20260811110000.';
