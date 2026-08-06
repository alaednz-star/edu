/**
 * Disposable test accounts for the E2E suites.
 *
 * The suites used to sign in as seeded demo accounts (`admin@madrasti.local`
 * and friends). Those are gone: the database now holds real production data,
 * and a production database must not carry test logins.
 *
 * Instead each run provisions its own throwaway staff accounts through the same
 * audited path the application uses (`auth.admin.createUser` +
 * `public.provision_staff`), then removes them. Nothing test-related survives a
 * run, and the real accounts are never signed into -- their passwords are
 * change-on-first-login and are not known to the harness.
 *
 * Usage:
 *   import { withFixtures } from "./fixtures.mjs";
 *   const fx = await withFixtures({ admin: true, teacher: true });
 *   ...
 *   await fx.cleanup();
 */
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);

export const API = env["VITE_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!/127\.0\.0\.1|localhost/.test(API)) {
  throw new Error(`fixtures are LOCAL ONLY; refusing to run against ${API}`);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/**
 * Local API keys, read from `.env.local` at run time.
 *
 * These used to be hard-coded in the suites. They are only ever the LOCAL
 * stack's keys, but committing key material is still wrong -- GitHub's secret
 * scanning correctly rejects it -- so the suites read them from the ignored
 * env file like every other consumer does.
 */
export const PUBLISHABLE_KEY =
  env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"] ?? "";
export const SERVICE_ROLE_KEY = KEY;

export const sql = async (query) => {
  const r = await fetch(`${API}/pg/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  return j;
};

/** Fixed password: these accounts exist only for the duration of one run. */
export const TEST_PASSWORD = "E2eFixture!2026";

/** Marks every fixture account so cleanup can find them unambiguously. */
const TAG = "e2e-fixture";

function uniqueEmail(role) {
  const n = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  return `${TAG}-${role}-${n}@example.test`;
}

async function createUser({ email, fullName, role }) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, [TAG]: true },
      app_metadata: { role, [TAG]: true },
    }),
  });
  if (!res.ok) throw new Error(`createUser ${email}: ${res.status} ${await res.text()}`);
  const user = await res.json();

  if (role === "admin" || role === "teacher") {
    await sql(
      `select public.provision_staff('${user.id}'::uuid, '${role}'::app_role, 0, null, null);`,
    );
  }
  // `handle_new_user` already gives a student identity, so students need nothing.

  // Fixtures sign in directly; the forced password change would block the flow.
  await sql(`update public.profiles set password_change_required = false where id = '${user.id}';`);

  return { id: user.id, email, fullName, role, password: TEST_PASSWORD };
}

/**
 * Provisions the requested accounts and returns them plus a `cleanup()`.
 * `cleanup()` is safe to call more than once.
 */
export async function withFixtures({ admin = false, teacher = false, student = false } = {}) {
  const made = [];

  if (admin)
    made.push(
      await createUser({ email: uniqueEmail("admin"), fullName: "E2E Admin", role: "admin" }),
    );
  if (teacher)
    made.push(
      await createUser({ email: uniqueEmail("teacher"), fullName: "E2E Teacher", role: "teacher" }),
    );
  if (student)
    made.push(
      await createUser({ email: uniqueEmail("student"), fullName: "E2E Student", role: "student" }),
    );

  const byRole = Object.fromEntries(made.map((m) => [m.role, m]));

  return {
    ...byRole,
    all: made,
    async cleanup() {
      await cleanupFixtures();
    },
  };
}

/**
 * A teaching group owned by the fixture teacher, with enrolled students.
 *
 * Suites previously relied on the seeded "WS Test" groups and `eleve*` students.
 * Those were demo data; a production database has neither. This builds the same
 * shape on demand: one group meeting on a known weekday, with `studentCount`
 * approved enrolments, so roster/attendance assertions have something to act on.
 *
 * Groups are named with the fixture tag so cleanup can find them, and are
 * removed by `cleanup()` along with the accounts.
 */
export async function createGroupFixture({
  teacherId,
  name = `${TAG} group`,
  weekday = new Date().getDay(),
  studentCount = 3,
  subjectKey = "mathematics",
}) {
  const subject = (await sql(`select id from public.subjects where key = '${subjectKey}';`))[0];
  const level = (
    await sql(`select id from public.levels where name = '3ème année secondaire';`)
  )[0];
  const stream = (
    await sql(`select id from public.streams where code='sciences' and level_id='${level.id}';`)
  )[0];

  // A teacher must be qualified in the subject they are assigned
  // (`validate_teacher_qualification`), so record the qualification first.
  await sql(`
    insert into public.teacher_subjects (teacher_id, subject_id)
    values ('${teacherId}', '${subject.id}') on conflict do nothing;`);

  const group = (
    await sql(`
      insert into public.groups
        (name, subject_id, teacher_id, level_id, stream_id, max_students, price_dzd, status, start_date, end_date)
      values ('${name.replace(/'/g, "''")}', '${subject.id}', '${teacherId}', '${level.id}',
              '${stream.id}', 20, 0, 'active', current_date - 30, current_date + 180)
      returning id;`)
  )[0];

  await sql(`
    insert into public.group_schedules (group_id, weekday, start_time, end_time)
    values ('${group.id}', ${weekday}, '14:00', '16:00');`);

  const students = [];
  for (let i = 0; i < studentCount; i++) {
    const s = await createUser({
      email: uniqueEmail("student"),
      fullName: `E2E Student ${i + 1}`,
      role: "student",
    });
    await sql(`
      insert into public.registrations (student_id, group_id, status, decided_at)
      values ('${s.id}', '${group.id}', 'approved', now());`);
    students.push(s);
  }

  return { id: group.id, name, weekday, students };
}

/**
 * Removes every fixture artefact, including leftovers from an aborted run.
 * Groups go first: `groups.teacher_id` is ON DELETE SET NULL, so deleting the
 * accounts alone would strand the groups in the production database.
 */
export async function cleanupFixtures() {
  await sql(`delete from public.groups where name like '${TAG}%';`);
  const rows = await sql(`select id from auth.users where email like '${TAG}-%@example.test';`);
  for (const r of rows) {
    await fetch(`${API}/auth/v1/admin/users/${r.id}`, { method: "DELETE", headers: H }).catch(
      () => {},
    );
  }
  return rows.length;
}
