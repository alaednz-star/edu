INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u WHERE u.email = 'alaednz@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles ur
USING auth.users u
WHERE ur.user_id = u.id AND u.email = 'alaednz@gmail.com' AND ur.role = 'student'::public.app_role;

DELETE FROM public.students s
USING auth.users u
WHERE s.id = u.id AND u.email = 'alaednz@gmail.com';