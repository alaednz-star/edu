/**
 * Production account + group provisioning (LOCAL).
 *
 * Mirrors `src/features/teachers/provisioning.server.ts` exactly rather than
 * writing a parallel path: create the auth user (which fires `handle_new_user`,
 * giving a profile plus a least-privilege student identity), then call
 * `provision_staff` to elevate under an admin check, create the staff row, flag
 * the temporary password and write the audit entry -- in one transaction.
 *
 * Nothing is inserted directly into auth tables and no password is ever stored,
 * logged, or written to the database. Passwords are printed once, to stdout.
 */
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

/* ------------------------------ config ------------------------------ */

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

const URL_ = env["VITE_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
if (!KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
if (!/127\.0\.0\.1|localhost/.test(URL_)) {
  throw new Error(`Refusing to run: this script is LOCAL ONLY, got ${URL_}`);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const sql = async (query) => {
  const r = await fetch(`${URL_}/pg/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  return j;
};

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

/* ---------------------------- provisioning --------------------------- */

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
      // Service-role only. Carries the role for JWT consumers; still not the
      // source of truth, which is user_roles.
      app_metadata: { role },
    }),
  });
  if (!res.ok) throw new Error(`createUser ${email}: ${res.status} ${await res.text()}`);
  const user = await res.json();

  // Elevate under the audited SQL path. One transaction: role grant, staff row,
  // password_change_required, audit entry.
  const args = [`'${user.id}'::uuid`, `'${role}'::app_role`, String(experienceYears), "null"];
  args.push(phone ? `'${phone.replace(/'/g, "''")}'` : "null");
  await sql(`select public.provision_staff(${args.join(", ")});`);

  return { id: user.id, fullName, email, role, password };
}

/* ------------------------------- data -------------------------------- */

const ADMINS = [
  { fullName: "Kenza Srir", email: "kenza@gmail.com", role: "admin" },
  { fullName: "Ala Eddine", email: "alaednz@gmail.com", role: "admin" },
];

// Both numbers are kept: `profiles.phone` is a single column, so they are stored
// as a separated pair rather than silently dropping the second.
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
// construction. Weekdays are spread so no teacher is double-booked at one time.
// BAC preparation maps onto 3eme annee secondaire: in the Algerian system the
// terminal year IS the BAC year, so no synthetic level is invented.
const GROUPS = [
  {
    name: "3AS Sciences - Mathématiques",
    subject: "mathematics",
    stream: "sciences",
    teacher: "boumediene.abidat@gmail.com",
    weekday: 0,
    start: "14:00",
    end: "16:00",
  },
  {
    name: "3AS Mathématiques",
    subject: "mathematics",
    stream: "maths",
    teacher: "boumediene.abidat@gmail.com",
    weekday: 2,
    start: "14:00",
    end: "16:00",
  },
  {
    name: "Préparation BAC - Mathématiques",
    subject: "mathematics",
    stream: "sciences",
    teacher: "boumediene.abidat@gmail.com",
    weekday: 5,
    start: "09:00",
    end: "12:00",
  },
  {
    name: "3AS Sciences - Physique",
    subject: "physics",
    stream: "sciences",
    teacher: "chaouch.habib@gmail.com",
    weekday: 1,
    start: "14:00",
    end: "16:00",
  },
  {
    name: "Préparation BAC - Physique",
    subject: "physics",
    stream: "sciences",
    teacher: "chaouch.habib@gmail.com",
    weekday: 5,
    start: "14:00",
    end: "17:00",
  },
  {
    name: "3AS Sciences - Sciences Naturelles",
    subject: "natural_sciences",
    stream: "sciences",
    teacher: "rachid.berji@gmail.com",
    weekday: 3,
    start: "14:00",
    end: "16:00",
  },
  {
    name: "Préparation BAC - Sciences Naturelles",
    subject: "natural_sciences",
    stream: "sciences",
    teacher: "rachid.berji@gmail.com",
    weekday: 6,
    start: "09:00",
    end: "12:00",
  },
];

/* -------------------------------- run -------------------------------- */

const created = [];

const existing = new Set((await sql(`select email from public.profiles;`)).map((r) => r.email));

console.log("Provisioning administrators");
for (const a of ADMINS) {
  if (existing.has(a.email)) {
    console.log(`  exists, skipping ${a.email}`);
    continue;
  }
  created.push(await createStaff(a));
}

console.log("Provisioning teachers");
for (const t of TEACHERS) {
  if (existing.has(t.email)) {
    console.log(`  exists, skipping ${t.email}`);
    continue;
  }
  const staff = await createStaff({ ...t, experienceYears: 0 });
  const subj = await sql(`select id from public.subjects where key = '${t.subjectKey}';`);
  await sql(
    `insert into public.teacher_subjects (teacher_id, subject_id)
     values ('${staff.id}', '${subj[0].id}') on conflict do nothing;`,
  );
  created.push({ ...staff, subject: t.subjectKey });
}

console.log("Creating groups");
const level = (await sql(`select id from public.levels where name = '3ème année secondaire';`))[0];
if (!level) throw new Error("Level '3ème année secondaire' not found");

for (const g of GROUPS) {
  const subj = (await sql(`select id from public.subjects where key = '${g.subject}';`))[0];
  const teacher = (await sql(`select id from public.profiles where email = '${g.teacher}';`))[0];
  const stream = (
    await sql(
      `select id from public.streams where code = '${g.stream}' and level_id = '${level.id}';`,
    )
  )[0];
  const rows = await sql(`
    insert into public.groups (name, subject_id, teacher_id, level_id, stream_id, max_students, price_dzd, status, start_date)
    values ('${g.name.replace(/'/g, "''")}', '${subj.id}', '${teacher.id}', '${level.id}', '${stream.id}', 20, 0, 'active', current_date)
    returning id;`);
  await sql(`
    insert into public.group_schedules (group_id, weekday, start_time, end_time)
    values ('${rows[0].id}', ${g.weekday}, '${g.start}', '${g.end}');`);
  console.log(`  ${g.name}`);
}

console.log("\n================ TEMPORARY CREDENTIALS ================");
console.log("Shown once. Not stored, not logged, not recoverable.\n");
for (const c of created) {
  console.log(`${c.role.toUpperCase().padEnd(8)} ${c.fullName}`);
  console.log(`         ${c.email}`);
  console.log(`         ${c.password}\n`);
}
