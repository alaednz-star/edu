-- Removes ALL demo data seeded for local testing, and nothing else.
--
-- Every demo account uses the @madrasti.local domain, so that is the anchor.
-- Real accounts (e.g. gmail.com) and the reference data created by the original
-- migrations (12 levels, 5 subjects, center_settings) are left untouched.
--
-- Run it in the Supabase SQL editor:
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Safe to run repeatedly. After running, re-seed with scripts/seed-demo-data.sql.

BEGIN;

-- Child rows first; most have ON DELETE CASCADE, but being explicit makes the
-- blast radius obvious and keeps the script readable.
DELETE FROM public.attendance
 WHERE student_id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local')
    OR marked_by  IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');

DELETE FROM public.student_notes
 WHERE student_id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local')
    OR author_id  IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');

DELETE FROM public.notifications
 WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');

DELETE FROM public.registrations
 WHERE student_id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');

-- Demo groups are identified by name; schedules cascade from them.
DELETE FROM public.group_schedules
 WHERE group_id IN (SELECT id FROM public.groups
                     WHERE name IN ('Maths 4AM — Groupe A',
                                    'Physique 1AS — Groupe B',
                                    'Français 4AM — Groupe C'));
DELETE FROM public.groups
 WHERE name IN ('Maths 4AM — Groupe A',
                'Physique 1AS — Groupe B',
                'Français 4AM — Groupe C');

DELETE FROM public.teacher_subjects
 WHERE teacher_id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');

DELETE FROM public.teachers
 WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');
DELETE FROM public.students
 WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');
DELETE FROM public.user_roles
 WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');
DELETE FROM public.profiles
 WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%@madrasti.local');

-- Finally the auth accounts themselves.
DELETE FROM auth.users WHERE email LIKE '%@madrasti.local';

COMMIT;

-- Confirm: demo rows gone, reference data intact.
SELECT 'remaining @madrasti.local users' AS check, count(*)::text AS value FROM auth.users WHERE email LIKE '%@madrasti.local'
UNION ALL SELECT 'levels (should stay 12)',   count(*)::text FROM public.levels
UNION ALL SELECT 'subjects (should stay 5)',  count(*)::text FROM public.subjects
UNION ALL SELECT 'groups remaining',          count(*)::text FROM public.groups
UNION ALL SELECT 'other users (real)',        count(*)::text FROM auth.users WHERE email NOT LIKE '%@madrasti.local';
