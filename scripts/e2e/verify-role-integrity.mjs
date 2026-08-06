import { withFixtures, PUBLISHABLE_KEY, SERVICE_ROLE_KEY } from "./fixtures.mjs";
/**
 * ADR-002 regression suite.
 * Re-runs the exact attacks that motivated the change, plus the security and
 * provisioning invariants that must not have regressed.
 */
const API = "http://127.0.0.1:54321";
const PUB = PUBLISHABLE_KEY;
const SEC = SERVICE_ROLE_KEY;
const SVC = { apikey: SEC, Authorization: `Bearer ${SEC}`, "Content-Type": "application/json" };

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  ok ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  -> ${d}`));
};
const sql = async (query) =>
  (await fetch(`${API}/pg/query`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })).json();
const login = async (email, password) => {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).access_token;
};
const asUser = (t) => ({ apikey: PUB, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

(async () => {
  // Disposable identities: the seeded demo accounts no longer exist, and the
  // real ones must never be used as probe targets.
  const fx = await withFixtures({ admin: true, teacher: true, student: true });
  const adminTok = await login(fx.admin.email, fx.admin.password);
  const studentTok = await login(fx.student.email, fx.student.password);
  const TEACHER = fx.teacher.id;
  const STUDENT = fx.student.id;

  console.log("[1] ADR-002: the original bypass is closed");
  let r = await fetch(`${API}/rest/v1/students`, {
    method: "POST", headers: asUser(adminTok), body: JSON.stringify({ id: TEACHER }),
  });
  check("admin CANNOT insert a teacher into students", !r.ok, `HTTP ${r.status}`);

  r = await fetch(`${API}/rest/v1/teachers`, {
    method: "POST", headers: asUser(adminTok), body: JSON.stringify({ id: STUDENT }),
  });
  check("admin CANNOT insert a student into teachers", !r.ok, `HTTP ${r.status}`);

  r = await fetch(`${API}/rest/v1/teachers`, {
    method: "POST", headers: asUser(studentTok), body: JSON.stringify({ id: STUDENT, status: "active" }),
  });
  check("student CANNOT self-insert into teachers (ADR-001 P0-A)", !r.ok, `HTTP ${r.status}`);

  console.log("\n[2] Role separation");
  let q = await sql(`select count(*)::int n from public.students s join public.user_roles r on r.user_id=s.id where r.role<>'student';`);
  check("zero contaminated students", q[0]?.n === 0, `${q[0]?.n}`);
  q = await sql(`select count(*)::int n from public.teachers t join public.user_roles r on r.user_id=t.id where r.role<>'teacher';`);
  check("zero contaminated teachers", q[0]?.n === 0, `${q[0]?.n}`);
  q = await sql(`select count(*)::int n from public.students s join public.user_roles r on r.user_id=s.id where r.role='admin';`);
  check("admin has no student identity", q[0]?.n === 0, `${q[0]?.n}`);

  console.log("\n[3] Students page shows only students");
  r = await fetch(`${API}/rest/v1/students?select=id`, { headers: asUser(adminTok) });
  const rows = await r.json();
  // Assert the INVARIANT, not a fixed count: seeding students for other suites
  // must not break this. Every row returned must belong to a real student.
  const roleCheck = await sql(`select count(*)::int n from public.students s join public.user_roles r on r.user_id=s.id where r.role<>'student';`);
  check("students list contains only students", Array.isArray(rows) && rows.length > 0 && (roleCheck[0]?.n ?? 0) === 0, `rows=${rows?.length} nonStudents=${roleCheck[0]?.n}`);

  console.log("\n[4] Provisioning still works (both roles)");
  const email = `adr2teacher${Date.now()}@example.test`;
  r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST", headers: SVC,
    body: JSON.stringify({
      email, password: "TempPass123!", email_confirm: true,
      user_metadata: { full_name: "ADR2 Probe" }, app_metadata: { role: "teacher" },
    }),
  });
  const created = await r.json();
  const tid = created.id;
  check("auth.admin.createUser succeeded", !!tid, JSON.stringify(created).slice(0, 120));

  if (tid) {
    // The trigger CANNOT know the role: GoTrue writes app_metadata in an UPDATE
    // after the INSERT fires (proven with a probe trigger). So it applies least
    // privilege, and provision_staff reconciles. Assert that contract, not a
    // trigger behaviour that is physically impossible.
    q = await sql(`select role::text r from public.user_roles where user_id='${tid}';`);
    check("trigger applies least privilege (student) before reconciliation", q[0]?.r === "student", `${q[0]?.r}`);

    r = await fetch(`${API}/rest/v1/rpc/provision_staff`, {
      method: "POST", headers: SVC,
      body: JSON.stringify({ _target: tid, _role: "teacher", _experience_years: 3, _bio: "probe" }),
    });
    check("provision_staff succeeds", r.ok, `HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);

    // After reconciliation the identity must be exactly one row, matching role.
    q = await sql(`select role::text r from public.user_roles where user_id='${tid}';`);
    check("role reconciled to teacher", q[0]?.r === "teacher", `${q[0]?.r}`);
    q = await sql(`select count(*)::int n from public.teachers where id='${tid}';`);
    check("teachers identity created", q[0]?.n === 1, `${q[0]?.n}`);
    q = await sql(`select count(*)::int n from public.students where id='${tid}';`);
    check("stale student identity removed (the original bug)", q[0]?.n === 0, `${q[0]?.n}`);
    q = await sql(`select count(*)::int n from public.user_roles where user_id='${tid}';`);
    check("exactly one role row", q[0]?.n === 1, `${q[0]?.n}`);

    await sql(`delete from auth.users where id='${tid}';`);
  }

  console.log("\n[5] Public signup still creates a student");
  const semail = `adr2student${Date.now()}@example.test`;
  r = await fetch(`${API}/auth/v1/signup`, {
    method: "POST", headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email: semail, password: "E2eFixture!2026", data: { full_name: "Probe", role: "admin" } }),
  });
  const signed = await r.json();
  const sid = signed.id || signed.user?.id;
  check("signup succeeded", !!sid, JSON.stringify(signed).slice(0, 120));
  if (sid) {
    q = await sql(`select role::text r from public.user_roles where user_id='${sid}';`);
    check("forged role:'admin' still ignored -> student", q[0]?.r === "student", `${q[0]?.r}`);
    q = await sql(`select count(*)::int n from public.students where id='${sid}';`);
    check("students row created", q[0]?.n === 1, `${q[0]?.n}`);
    q = await sql(`select count(*)::int n from public.teachers where id='${sid}';`);
    check("no teachers row", q[0]?.n === 0, `${q[0]?.n}`);
    await sql(`delete from auth.users where id='${sid}';`);
  }

  console.log("\n[6] Generic services");
  q = await sql(`select severity, row_count from public.entity_dependencies('teacher','${TEACHER}') order by severity;`);
  check("entity_dependencies('teacher') returns rows", Array.isArray(q) && q.length >= 4, `${q?.length}`);
  q = await sql(`select severity from public.entity_dependencies('student','${STUDENT}');`);
  check("entity_dependencies('student') works (generic)", Array.isArray(q) && q.length >= 4, `${q?.length}`);
  q = await sql(`select private.entity_is_deletable('teacher','${TEACHER}')::text d;`);
  check("teacher undeletable (has audit history)", q[0]?.d === "false", `${q[0]?.d}`);

  console.log("\n[7] Lifecycle via the generic engine");
  await sql(`select private.entity_lifecycle('teacher','${TEACHER}','suspended','regression');`);
  q = await sql(`select status::text s from public.teachers where id='${TEACHER}';`);
  check("suspend works through entity_lifecycle", q[0]?.s === "suspended", `${q[0]?.s}`);
  await sql(`select private.set_teacher_lifecycle('${TEACHER}','active','restored');`);
  q = await sql(`select status::text s from public.teachers where id='${TEACHER}';`);
  check("teacher wrapper delegates correctly", q[0]?.s === "active", `${q[0]?.s}`);

  console.log("\n[8] RLS unchanged");
  r = await fetch(`${API}/rest/v1/audit_log?select=id`, { headers: asUser(studentTok) });
  const al = await r.json();
  check("student cannot read audit_log", !Array.isArray(al) || al.length === 0, `${al?.length}`);
  r = await fetch(`${API}/rest/v1/profiles?select=email`, { headers: asUser(studentTok) });
  const pr = await r.json();
  check("student sees only their own profile", Array.isArray(pr) && pr.length === 1, `${pr?.length}`);

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}  pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
