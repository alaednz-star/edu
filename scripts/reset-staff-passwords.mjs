/**
 * Reset the temporary password for the provisioned staff accounts.
 *
 * Needed because the first production runs crashed after creating accounts but
 * before the end-of-run summary printed, so the generated passwords were lost.
 * They are never stored -- the database keeps only a hash -- so they cannot be
 * recovered, only replaced.
 *
 * This updates the password IN PLACE via the admin API. Nothing is deleted, so
 * groups, qualifications, roles and audit history are untouched.
 *
 * `password_change_required` is re-armed for each account, so the holder must
 * still choose their own password on first sign-in.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<secret> \
 *   node scripts/reset-staff-passwords.mjs
 *
 * Each password is printed as soon as it is set, so a later failure cannot lose
 * the ones already done.
 */

const URL_ = process.env["SUPABASE_URL"];
const KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!URL_ || !KEY) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n\n" +
      "  SUPABASE_URL=https://ikowzxluqkbmibkafsfl.supabase.co \\\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=<service role key> \\\n" +
      "  node scripts/reset-staff-passwords.mjs\n",
  );
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const EMAILS = [
  "kenza@gmail.com",
  "alaednz@gmail.com",
  "rachid.berji@gmail.com",
  "chaouch.habib@gmail.com",
  "boumediene.abidat@gmail.com",
];

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

/* -------------------------------- run -------------------------------- */

console.log(`Target: ${URL_}\n`);

// Resolve each address to its user id. `profiles` mirrors auth.users and is
// readable with the service role.
const profiles = await (
  await fetch(`${URL_}/rest/v1/profiles?select=id,email,full_name`, { headers: H })
).json();
const byEmail = new Map(profiles.map((p) => [p.email, p]));

const done = [];

for (const email of EMAILS) {
  const p = byEmail.get(email);
  if (!p) {
    console.log(`  NOT FOUND         ${email}  (skipped)`);
    continue;
  }

  const password = generateTemporaryPassword();

  const res = await fetch(`${URL_}/auth/v1/admin/users/${p.id}`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    console.log(`  FAILED            ${email}: ${res.status} ${await res.text()}`);
    continue;
  }

  // Re-arm the forced change: the holder must still pick their own password.
  await fetch(`${URL_}/rest/v1/profiles?id=eq.${p.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ password_change_required: true }),
  });

  // Printed immediately, not in a summary, so a later failure cannot lose it.
  console.log(`  RESET  ${p.full_name} <${email}>`);
  console.log(`         PASSWORD: ${password}\n`);
  done.push(email);
}

console.log(`Reset ${done.length} of ${EMAILS.length} account(s).`);
console.log("Save these now: they are not stored and cannot be shown again.");
