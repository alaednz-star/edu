-- Seeds demo groups, schedules, registrations, attendance and notifications.
--
-- PREREQUISITE: the demo AUTH accounts must exist first. They cannot be created
-- from SQL, because auth.users rows must be created through Supabase Auth so the
-- password is hashed correctly. Create them via the Dashboard
-- (Authentication -> Users -> Add user, "Auto Confirm" ticked) or by signing up
-- at /register, using these emails:
--
--   admin@madrasti.local     teacher@madrasti.local     student@madrasti.local
--   demo.eleve1..7@madrasti.local        (seven classmates)
--
-- Then run this script in the Supabase SQL editor. Safe to re-run after
-- scripts/reset-demo-data.sql.

DO $$
DECLARE
  a uuid; tch uuid; stu uuid
  s_math uuid; s_phys uuid; s_fr uuid;
  lvl_4am uuid; lvl_1as uuid;
  g_math uuid; g_phys uuid; g_fr uuid;
  extra_ids uuid[];
  peer uuid; i int; d date; st public.attendance_status; roll int;
BEGIN
  SELECT id INTO a   FROM auth.users WHERE email='admin@madrasti.local';
  SELECT id INTO tch FROM auth.users WHERE email='teacher@madrasti.local';
  SELECT id INTO stu FROM auth.users WHERE email='student@madrasti.local';

  IF a IS NULL OR tch IS NULL OR stu IS NULL THEN
    RAISE EXCEPTION 'Demo auth accounts missing. Create them in Supabase Auth first (see header).';
  END IF;

  SELECT array_agg(id ORDER BY email) INTO extra_ids
  FROM auth.users WHERE email LIKE 'demo.eleve%@madrasti.local';

  -- Roles: signup defaults everyone to student, so admin/teacher need promoting.
  DELETE FROM public.students   WHERE id IN (a, tch);
  DELETE FROM public.user_roles WHERE user_id IN (a, tch);
  INSERT INTO public.user_roles(user_id, role) VALUES (a, 'admin'), (tch, 'teacher');
  INSERT INTO public.teachers(id, experience_years, bio, status)
  VALUES (tch, 8, 'Professeur de mathématiques, spécialisé en préparation au BEM et au BAC.', 'active')
  ON CONFLICT (id) DO UPDATE SET experience_years=EXCLUDED.experience_years,
                                 bio=EXCLUDED.bio, status=EXCLUDED.status;
  INSERT INTO public.user_roles(user_id, role) VALUES (stu, 'student') ON CONFLICT DO NOTHING;
  INSERT INTO public.students(id, status) VALUES (stu, 'active')
  ON CONFLICT (id) DO UPDATE SET status='active';

  SELECT id INTO s_math FROM public.subjects WHERE name='Mathématiques';
  SELECT id INTO s_phys FROM public.subjects WHERE name='Physique';
  SELECT id INTO s_fr   FROM public.subjects WHERE name='Français';
  SELECT id INTO lvl_4am FROM public.levels WHERE stage='middle' ORDER BY position DESC LIMIT 1;
  SELECT id INTO lvl_1as FROM public.levels WHERE stage='high'   ORDER BY position ASC  LIMIT 1;

  INSERT INTO public.teacher_subjects(teacher_id, subject_id)
  VALUES (tch, s_math), (tch, s_phys) ON CONFLICT DO NOTHING;

  UPDATE public.students SET level_id=lvl_4am WHERE id=stu;
  UPDATE public.profiles SET phone='0555 12 34 56' WHERE id=stu;
  UPDATE public.profiles SET phone='0661 78 90 12' WHERE id=tch;
  UPDATE public.profiles SET phone='0770 00 11 22' WHERE id=a;

  -- Two groups for the demo teacher, one unassigned so the admin has work to do.
  INSERT INTO public.groups(name, subject_id, teacher_id, level_id, max_students, price_dzd, status)
  VALUES ('Maths 4AM — Groupe A', s_math, tch, lvl_4am, 20, 3000, 'active') RETURNING id INTO g_math;
  INSERT INTO public.groups(name, subject_id, teacher_id, level_id, max_students, price_dzd, status)
  VALUES ('Physique 1AS — Groupe B', s_phys, tch, lvl_1as, 15, 3500, 'active') RETURNING id INTO g_phys;
  INSERT INTO public.groups(name, subject_id, teacher_id, level_id, max_students, price_dzd, status)
  VALUES ('Français 4AM — Groupe C', s_fr, NULL, lvl_4am, 18, 2500, 'active') RETURNING id INTO g_fr;

  INSERT INTO public.group_schedules(group_id, weekday, start_time, end_time, room) VALUES
    (g_math, 0, '09:00', '10:30', 'Salle 1'),
    (g_math, 3, '09:00', '10:30', 'Salle 1'),
    (g_phys, 1, '14:00', '15:30', 'Salle 2'),
    (g_phys, 4, '14:00', '15:30', 'Salle 2'),
    (g_fr,   2, '10:45', '12:15', 'Salle 3');

  IF extra_ids IS NOT NULL THEN
    FOR i IN 1..array_length(extra_ids,1) LOOP
      peer := extra_ids[i];
      UPDATE public.students
         SET level_id = CASE WHEN i <= 4 THEN lvl_4am ELSE lvl_1as END, status='active'
       WHERE id = peer;
      UPDATE public.profiles SET phone='05'||lpad((10000000+i*137)::text,8,'0') WHERE id=peer;
    END LOOP;
  END IF;

  INSERT INTO public.registrations(student_id, group_id, status, decided_at) VALUES
    (stu, g_math, 'approved', now() - interval '40 days'),
    (stu, g_phys, 'approved', now() - interval '35 days');
  INSERT INTO public.registrations(student_id, group_id, status) VALUES (stu, g_fr, 'pending');

  IF extra_ids IS NOT NULL THEN
    FOR i IN 1..array_length(extra_ids,1) LOOP
      peer := extra_ids[i];
      IF i <= 4 THEN
        INSERT INTO public.registrations(student_id, group_id, status, decided_at)
        VALUES (peer, g_math, 'approved', now() - interval '38 days');
      ELSE
        INSERT INTO public.registrations(student_id, group_id, status, decided_at)
        VALUES (peer, g_phys, 'approved', now() - interval '30 days');
      END IF;
    END LOOP;
    INSERT INTO public.registrations(student_id, group_id, status) VALUES
      (extra_ids[1], g_fr, 'pending'),
      (extra_ids[5], g_math, 'pending');
  END IF;

  -- Six weeks of attendance on the real session weekdays. The distribution is
  -- deliberately varied so the "students at risk" widget has genuine signal.
  FOR i IN 0..41 LOOP
    d := (CURRENT_DATE - i);

    IF EXTRACT(DOW FROM d) IN (0, 3) THEN
      roll := (i * 7) % 10;
      st := CASE WHEN roll < 7 THEN 'present' WHEN roll < 8 THEN 'late'
                 WHEN roll < 9 THEN 'excused' ELSE 'absent' END;
      INSERT INTO public.attendance(group_id, student_id, session_date, status, marked_by)
      VALUES (g_math, stu, d, st, tch) ON CONFLICT DO NOTHING;

      IF extra_ids IS NOT NULL THEN
        FOR peer IN SELECT unnest(extra_ids[1:4]) LOOP
          roll := (i*3 + abs(hashtext(peer::text)) % 10) % 10;
          st := CASE WHEN roll < 6 THEN 'present' WHEN roll < 7 THEN 'late'
                     WHEN roll < 8 THEN 'excused' ELSE 'absent' END;
          INSERT INTO public.attendance(group_id, student_id, session_date, status, marked_by)
          VALUES (g_math, peer, d, st, tch) ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END IF;

    IF EXTRACT(DOW FROM d) IN (1, 4) THEN
      roll := (i * 5) % 10;
      st := CASE WHEN roll < 8 THEN 'present' WHEN roll < 9 THEN 'late' ELSE 'absent' END;
      INSERT INTO public.attendance(group_id, student_id, session_date, status, marked_by)
      VALUES (g_phys, stu, d, st, tch) ON CONFLICT DO NOTHING;

      IF extra_ids IS NOT NULL THEN
        FOR peer IN SELECT unnest(extra_ids[5:7]) LOOP
          roll := (i*4 + abs(hashtext(peer::text)) % 10) % 10;
          st := CASE WHEN roll < 4 THEN 'present' WHEN roll < 5 THEN 'late' ELSE 'absent' END;
          INSERT INTO public.attendance(group_id, student_id, session_date, status, marked_by)
          VALUES (g_phys, peer, d, st, tch) ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Give the demo student a mixed record rather than a synthetic-looking 100%.
  UPDATE public.attendance a2
     SET status = CASE WHEN p.rn IN (4, 11) THEN 'absent'::public.attendance_status
                       ELSE 'excused'::public.attendance_status END
    FROM (SELECT id, row_number() OVER (ORDER BY session_date DESC) rn
            FROM public.attendance WHERE student_id = stu) p
   WHERE a2.id = p.id AND p.rn IN (4, 7, 11);

  INSERT INTO public.student_notes(student_id, author_id, body)
  VALUES (stu, tch, 'Très bonne progression en algèbre ce trimestre. À encourager sur la géométrie.');

  INSERT INTO public.notifications(user_id, kind, params, read_at) VALUES
    (stu, 'attendance_marked', jsonb_build_object('group','Maths 4AM — Groupe A'), NULL),
    (tch, 'teacher_assigned',  jsonb_build_object('group','Physique 1AS — Groupe B'), NULL),
    (tch, 'group_updated',     jsonb_build_object('group','Maths 4AM — Groupe A'), now() - interval '2 days');
END $$;

SELECT 'groups' AS table, count(*)::text AS rows FROM public.groups
UNION ALL SELECT 'group_schedules', count(*)::text FROM public.group_schedules
UNION ALL SELECT 'students',        count(*)::text FROM public.students
UNION ALL SELECT 'registrations',   count(*)::text FROM public.registrations
UNION ALL SELECT 'attendance',      count(*)::text FROM public.attendance
UNION ALL SELECT 'notifications',   count(*)::text FROM public.notifications
ORDER BY 1;
