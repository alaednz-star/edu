-- ==================================================================
-- `notification_kind` gains the two resource values
--
-- TWO STATEMENTS, ITS OWN MIGRATION, for the reason `20260811095000` documents at
-- length: Postgres refuses to let a new enum value be USED in the transaction that
-- added it, and `supabase db push` runs each migration file in one transaction. The
-- next migration writes these values from a trigger body -- which is only compiled
-- at call time, so it would survive -- but its post-conditions read them, and a
-- future migration that backfills would not. Splitting is the cheap habit.
--
-- Only two, and only these two. A student is told when material becomes available to
-- them; there is no `resource_scheduled` value because a student has no use for
-- "this will appear on Monday", and the scheduling itself is expressed by
-- `notifications.deliver_at` rather than by a kind.
-- ==================================================================

alter type public.notification_kind add value if not exists 'resource_published';
alter type public.notification_kind add value if not exists 'chapter_published';
