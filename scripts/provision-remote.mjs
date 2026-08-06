/**
 * Provision the real accounts and groups on a REMOTE Supabase project.
 *
 * Same data and same audited path as `provision-production.mjs`, but it talks
 * to PostgREST and RPC instead of the local-only `/pg/query` helper, which does
 * not exist on hosted projects.
 *
 * Credentials are read from the environment, never from a committed file:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<secret> \
 *   node scripts/provision-remote.mjs
 *
 * The service role key is required because creating an account calls
 * `auth.admin.createUser`. It is used here and never stored or logged.
 *
 * Idempotent: accounts and groups that already exist are skipped, so a partial
 * run can be repeated safely.
 */

const URL_ = process.env["SUPABASE_URL"];
const KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!URL_ || !KEY) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n\n" +
      "  SUPABASE_URL=https://ikowzxluqkbmibkafsfl.supabase.co \\\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=<service role key> \\\n" +
      "  node scripts/provision-remote.mjs\n",
  );
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/** PostgREST read. */
async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** PostgREST write; returns the created rows. */
async function insert(table, body) {
  const r = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** Stored-procedure call (the audited provisioning path). */
async function rpc(fn, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`RPC ${fn}: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/* --------------------------- password gen --------------------------- */
// Same alphabet and rejection sampling as provisioning.server.ts: excludes
// 0/O and 1/l/I because an admin will read these aloud to the account holder.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const SYMBOLS = "!@#$%&*?";
const LENGTH = 16;

function generateTemporaryPassword() {
  const pool = ALPHABET + SYMBOLS;
  const max = Math.floor(256 / pool.length) * pool.length;
  const out = [];
  while (out.length < LENGTH) {
    const bytes = new Uint8Array(LENGTH);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (out.length >= LENGTH) break;
      if (b >= max) continue; // reject the biasing tail
      out.push(pool[b % pool.length]);
    }
  }
  const ensure = (chars, klass, at) => {
    if (chars.some((c) => klass.includes(c))) return chars;
    const b = new Uint8Array(1);
    crypto.getRandomValues(b);
    const copy = [...chars];
    copy[at] = klass[b[0] % klass.length];
    return copy;
  };
  return ensure(ensure(out, SYMBOLS, 0), "23456789", 1).join("");
}

/* ------------------------------- data -------------------------------- */

const ADMINS = [
  { fullName: "Kenza Srir", email: "kenza@gmail.com", role: "admin", phone: null },
  { fullName: "Ala Eddine", email: "alaednz@gmail.com", role: "admin", phone: null },
];

// `profiles.phone` is a single column, so both numbers are kept as a pair
// rather than silently dropping the second.
const TEACHERS = [
  {
    fullName: "Rachid Berji",
    email: "rachid.berji@gmail.com",
    role: "teacher",
    phone: "0553 02 77 94 / 0540 44 71 03",
    subjectKey: "natural_sciences",
  },
  {
    fullName: "Chaouch Habib",
    email: "chaouch.habib@gmail.com",
    role: "teacher",
    phone: "0540 44 71 03 / 0553 02 77 94",
    subjectKey: "physics",
  },
  {
    fullName: "Boumediene Abidat",
    email: "boumediene.abidat@gmail.com",
    role: "teacher",
    phone: "0540 44 71 03 / 0553 02 77 94",
    subjectKey: "mathematics",
  },
];

// One weekly session per group, so UNIQUE (group_id, weekday) holds by
// construction. BAC preparation maps onto 3ème année secondaire: in the
// Algerian system the terminal year IS the BAC year.
const GROUPS = [
  { name: "3AS Sciences - Mathématiques", subject: "mathematics", stream: "sciences", teacher: "boumediene.abidat@gmail.com", weekday: 0, start: "14:00", end: "16:00" },
  { name: "3AS Mathématiques", subject: "mathematics", stream: "maths", teacher: "boumediene.abidat@gmail.com", weekday: 2, start: "14:00", end: "16:00" },
  { name: "Préparation BAC - Mathématiques", subject: "mathematics", stream: "sciences", teacher: "boumediene.abidat@gmail.com", weekday: 5, start: "09:00", end: "12:00" },
  { name: "3AS Sciences - Physique", subject: "physics", stream: "sciences", teacher: "chaouch.habib@gmail.com", weekday: 1, start: "14:00", end: "16:00" },
  { name: "Préparation BAC - Physique", subject: "physics", stream: "sciences", teacher: "chaouch.habib@gmail.com", weekday: 5, start: "14:00", end: "17:00" },
  { name: "3AS Sciences - Sciences Naturelles", subject: "natural_sciences", stream: "sciences", teacher: "rachid.berji@gmail.com", weekday: 3, start: "14:00", end: "16:00" },
  { name: "Préparation BAC - Sciences Naturelles", subject: "natural_sciences", stream: "sciences", teacher: "rachid.berji@gmail.com", weekday: 6, start: "09:00", end: "12:00" },
];

const LEVEL_NAME = "3ème année secondaire";

/* ------------------------------ provision ---------------------------- */

async function createStaff({ fullName, email, role, phone, experienceYears = 0 }) {
  const password = generateTemporaryPassword();

  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      email,
      password,
      // The admin vouches for the address; no email round trip before first use.
      email_confirm: true,
      // Descriptive only -- user_metadata is writable by the account holder and
      // must never influence authorisation.
      user_metadata: { full_name: fullName, phone: phone ?? null },
      // Service-role only. Carries the role for JWT consumers; user_roles
      // remains the source of truth.
      app_metadata: { role },
    }),
  });
  if (!res.ok) throw new Error(`createUser ${email}: ${res.status} ${await res.text()}`);
  const user = await res.json();

  // Elevate through the audited SQL path: role grant, staff row,
  // password_change_required and audit entry, in one transaction.
  await rpc("provision_staff", {
    _target: user.id,
    _role: role,
    _experience_years: experienceYears,
    ...(phone == null ? {} : { _phone: phone }),
  });

  return { id: user.id, fullName, email, role, password };
}

/* -------------------------------- run -------------------------------- */

console.log(`Target: ${URL_}\n`);

const created = [];
const existingProfiles = await rest("profiles?select=id,email");
const existing = new Map(existingProfiles.map((p) => [p.email, p.id]));

console.log("Administrators");
for (const a of ADMINS) {
  if (existing.has(a.email)) {
    console.log(`  exists, skipping  ${a.email}`);
    continue;
  }
  const s = await createStaff(a);
  existing.set(s.email, s.id);
  created.push(s);
  console.log(`  created           ${a.email}`);
}

console.log("\nTeachers");
const subjects = new Map((await rest("subjects?select=id,key")).map((s) => [s.key, s.id]));
for (const t of TEACHERS) {
  if (existing.has(t.email)) {
    console.log(`  exists, skipping  ${t.email}`);
    continue;
  }
  const s = await createStaff({ ...t, experienceYears: 0 });
  existing.set(s.email, s.id);
  created.push({ ...s, subject: t.subjectKey });

  const subjectId = subjects.get(t.subjectKey);
  if (!subjectId) throw new Error(`subject "${t.subjectKey}" not found on this project`);
  await insert("teacher_subjects", { teacher_id: s.id, subject_id: subjectId });
  console.log(`  created           ${t.email}  (${t.subjectKey})`);
}

console.log("\nGroups");
const levels = await rest(`levels?select=id,name&name=eq.${encodeURIComponent(LEVEL_NAME)}`);
if (!levels[0]) throw new Error(`level "${LEVEL_NAME}" not found on this project`);
const levelId = levels[0].id;

const streams = new Map(
  (await rest(`streams?select=id,code&level_id=eq.${levelId}`)).map((s) => [s.code, s.id]),
);
const existingGroups = new Set((await rest("groups?select=name")).map((g) => g.name));
const today = new Date().toISOString().slice(0, 10);

for (const g of GROUPS) {
  if (existingGroups.has(g.name)) {
    console.log(`  exists, skipping  ${g.name}`);
    continue;
  }
  const [row] = await insert("groups", {
    name: g.name,
    subject_id: subjects.get(g.subject),
    teacher_id: existing.get(g.teacher),
    level_id: levelId,
    stream_id: streams.get(g.stream),
    max_students: 20,
    price_dzd: 0,
    status: "active",
    start_date: today,
  });
  await insert("group_schedules", {
    group_id: row.id,
    weekday: g.weekday,
    start_time: g.start,
    end_time: g.end,
  });
  console.log(`  created           ${g.name}`);
}

if (created.length === 0) {
  console.log("\nNothing new to create; every account already existed.");
} else {
  console.log("\n================ TEMPORARY CREDENTIALS ================");
  console.log("Shown once. Not stored, not logged, not recoverable.\n");
  for (const c of created) {
    console.log(`${c.role.toUpperCase().padEnd(8)} ${c.fullName}`);
    console.log(`         ${c.email}`);
    console.log(`         ${c.password}\n`);
  }
}
