/**
 * Remove the redundant "Préparation BAC" groups.
 *
 * They were a mistake in the original provisioning data: in the Algerian system
 * the terminal year (3AS) IS the BAC year, so each BAC group duplicated its 3AS
 * counterpart -- same subject, same level, same `sciences` stream, differing
 * only by weekday. The centre wants one group per cohort.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<secret> \
 *   node scripts/remove-bac-groups.mjs
 *
 * Refuses to delete a group that has ANY registrations, so no student is ever
 * silently unenrolled. Deleting a group cascades to its schedules, which is the
 * intended cleanup. Pass --dry-run to preview without deleting.
 */

const URL_ = process.env["SUPABASE_URL"];
const KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const DRY = process.argv.includes("--dry-run");

if (!URL_ || !KEY) {
  console.error(
    "Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n\n" +
      "  SUPABASE_URL=https://ikowzxluqkbmibkafsfl.supabase.co \\\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=<service role key> \\\n" +
      "  node scripts/remove-bac-groups.mjs [--dry-run]\n",
  );
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const rest = async (path) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

console.log(`Target: ${URL_}${DRY ? "  (dry run)" : ""}\n`);

const groups = await rest("groups?select=id,name");
const doomed = groups.filter((g) => /^Préparation BAC/i.test(g.name));

if (doomed.length === 0) {
  console.log("No 'Préparation BAC' groups found; nothing to do.");
  process.exit(0);
}

let removed = 0;

for (const g of doomed) {
  // A group with enrolments is real data, not a provisioning artefact.
  const regs = await rest(`registrations?select=id&group_id=eq.${g.id}`);
  if (regs.length > 0) {
    console.log(`  SKIP    ${g.name}  (${regs.length} registration(s) -- not a leftover)`);
    continue;
  }

  if (DRY) {
    console.log(`  WOULD DELETE  ${g.name}`);
    continue;
  }

  const r = await fetch(`${URL_}/rest/v1/groups?id=eq.${g.id}`, { method: "DELETE", headers: H });
  if (!r.ok) {
    console.log(`  FAILED  ${g.name}: ${r.status} ${await r.text()}`);
    continue;
  }
  console.log(`  deleted ${g.name}`);
  removed++;
}

const left = await rest("groups?select=name&order=name");
console.log(`\n${DRY ? "Would remove" : "Removed"} ${DRY ? doomed.length : removed} group(s).`);
console.log(`Remaining groups (${left.length}):`);
for (const g of left) console.log(`  ${g.name}`);
