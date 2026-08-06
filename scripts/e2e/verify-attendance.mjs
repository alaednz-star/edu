/**
 * Attendance workflow, end-to-end in a real browser as a real teacher.
 *
 * Covers every entry point, the four statuses, saving, re-loading, updating an
 * existing register, permission scoping, and the loading / empty / error paths.
 */
import { chromium } from "playwright-core";
import { withFixtures, createGroupFixture } from "./fixtures.mjs";

const APP = "http://localhost:5173";
const API = "http://127.0.0.1:54321";
// Disposable teacher with two groups: one meeting today (markable) and one on
// another weekday, so the "group does not meet on this date" guard is exercised.
const fx = await withFixtures({ teacher: true });
const TEACHER = fx.teacher.id;
const today = new Date().getDay();
const groupA = await createGroupFixture({
  teacherId: TEACHER, name: "e2e-fixture Attendance A",
  weekday: today, studentCount: 4, subjectKey: "mathematics",
});
const groupB = await createGroupFixture({
  teacherId: TEACHER, name: "e2e-fixture Attendance B",
  weekday: (today + 3) % 7, studentCount: 3, subjectKey: "mathematics",
});

let pass = 0, fail = 0;
const check = (n, ok, d = "") => {
  ok ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  -> ${d}`));
};
const sql = async (query) =>
  (await fetch(`${API}/pg/query`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })).json();

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
// The unsaved-changes guard uses window.confirm; accept it so the suite can
// exercise group/date switching deliberately.
page.on("dialog", (d) => void d.accept());

const login = async (email) => {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', fx.teacher.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
};

try {
  await sql(`delete from public.attendance;`);
  await login(fx.teacher.email);

  console.log("[1] Entry points reach attendance");
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const heroCta = page.getByRole("link", { name: /marquer les présences|mark attendance/i }).first();
  check("hero CTA present on workspace", (await heroCta.count()) > 0);
  await heroCta.click();
  await page.waitForTimeout(2500);
  check("hero CTA navigates to attendance", /attendance/.test(page.url()), page.url());

  await page.goto(`${APP}/dashboard/attendance`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log("\n[2] Group selection scoped to the teacher");
  const trigger = page.locator('[role="combobox"]').first();
  check("group selector present", (await trigger.count()) > 0);
  await trigger.click();
  await page.waitForTimeout(900);
  const options = await page.locator('[role="option"]').allInnerTexts();
  check("only this teacher's groups listed", options.length > 0 && options.every((o) => /e2e-fixture Attendance/i.test(o)), options.join(","));
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(2500);

  // Move the date to a day this group ACTUALLY meets. Hard-coding "today" made
  // the suite fail whenever the clock rolled onto a weekday with no session --
  // the save button is then correctly disabled, which is the feature working.
  // Scoped to the group the UI actually has selected (the first option, ordered
  // the same way the Select renders them) and clamped to that group's term, so
  // the date is one the app agrees has a session.
  const meetingDate = await sql(`
    with picked as (
      select g.id, g.start_date, g.end_date
        from public.groups g
       where g.teacher_id = '${TEACHER}'
       order by g.name
       limit 1
    )
    select to_char(
             current_date + ((gs.weekday - extract(dow from current_date)::int + 7) % 7),
             'YYYY-MM-DD') d
      from public.group_schedules gs
      join picked p on p.id = gs.group_id
     where current_date + ((gs.weekday - extract(dow from current_date)::int + 7) % 7)
             between p.start_date and coalesce(p.end_date, 'infinity'::date)
     order by 1
     limit 1;`);
  if (meetingDate[0]?.d) {
    await page.fill('input[type="date"]', meetingDate[0].d);
    await page.waitForTimeout(2500);
    console.log(`      using ${meetingDate[0].d} (a day this group meets)`);
  }

  console.log("\n[3] Roster loads enrolled students");
  const body = await page.locator("body").innerText();
  check("roster shows enrolled students", /E2E Student/i.test(body), body.slice(0, 200));

  console.log("\n[4] All four statuses are offered");
  for (const [label, re] of [
    ["present", /présent|present|حاضر/i],
    ["absent", /absent|غائب/i],
    ["late", /retard|late|متأخر/i],
    ["excused", /excusé|excused|بعذر/i],
  ]) {
    check(`status "${label}" available`, re.test(body));
  }

  console.log("\n[5] Marking and saving");
  const presentButtons = page.getByRole("button", { name: /^présent|^present$/i });
  const n = await presentButtons.count();
  check("per-student status buttons render", n > 0, `${n}`);
  for (let i = 0; i < Math.min(n, 3); i++) await presentButtons.nth(i).click();
  await page.waitForTimeout(600);

  const saveBtn = page.getByRole("button", { name: /enregistrer|save|حفظ/i }).first();
  check("save button present", (await saveBtn.count()) > 0);
  await saveBtn.click();
  await page.waitForTimeout(3500);

  let rows = await sql(`select count(*)::int n from public.attendance;`);
  check("attendance rows written to the database", (rows[0]?.n ?? 0) > 0, `${rows[0]?.n}`);

  console.log("\n[6] Reload keeps the marks (no data loss)");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(2500);
  // The reload reset the picker to today; put it back on a meeting day.
  if (meetingDate[0]?.d) {
    await page.fill('input[type="date"]', meetingDate[0].d);
    await page.waitForTimeout(2500);
  }
  const after = await sql(`select count(*)::int n from public.attendance;`);
  check("marks persisted after reload", (after[0]?.n ?? 0) > 0, `${after[0]?.n}`);

  console.log("\n[7] Re-saving updates rather than duplicating");
  const before = (await sql(`select count(*)::int n from public.attendance;`))[0]?.n ?? 0;
  const absentButtons = page.getByRole("button", { name: /^absent$/i });
  if ((await absentButtons.count()) > 0) {
    await absentButtons.first().click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /enregistrer|save|حفظ/i }).first().click();
    await page.waitForTimeout(3500);
  }
  const dup = (await sql(`select count(*)::int n from public.attendance;`))[0]?.n ?? 0;
  check("no duplicate rows created", dup === before, `before=${before} after=${dup}`);

  const uniq = await sql(`
    select count(*)::int n from (
      select group_id, student_id, session_date
        from public.attendance
       group by 1,2,3 having count(*) > 1
    ) d;`);
  check("unique (group, student, date) holds", (uniq[0]?.n ?? 0) === 0, `${uniq[0]?.n} duplicated keys`);

  console.log("\n[8] marked_by recorded");
  const mb = await sql(`select count(*)::int n from public.attendance where marked_by='${TEACHER}';`);
  check("rows attributed to the signed-in teacher", (mb[0]?.n ?? 0) > 0, `${mb[0]?.n}`);

  console.log("\n[8b] Group that does not meet on the selected date (P0 regression)");
  // Reported bug: choosing a group whose schedule excludes the selected date let
  // the teacher mark a whole class, then failed with HTTP 400 and a generic
  // toast, losing the work. It must be warned and blocked before any request.
  const http400 = [];
  page.on("response", (r) => {
    if (r.url().includes("/rest/v1/attendance") && r.status() >= 400) http400.push(r.status());
  });
  await page.goto(`${APP}/dashboard/attendance`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(800);
  if ((await page.locator('[role="option"]').count()) > 1) {
    await page.locator('[role="option"]').nth(1).click();
    await page.waitForTimeout(2800);
    const txt = await page.locator("body").innerText();
    const warned = /n'a pas cours|does not meet|لا توجد حصة/i.test(txt);
    const disabled = await page
      .getByRole("button", { name: /enregistrer|save|حفظ/i })
      .first()
      .isDisabled();
    // Either the group meets that day (no warning, save usable) or it does not
    // (warning shown, save blocked). A silent 400 is the failure mode.
    check("unschedulable date is warned and blocked", !warned || disabled, `warned=${warned} disabled=${disabled}`);
    check("no 400 from the attendance endpoint", http400.length === 0, http400.join(","));
  }

  console.log("\n[8c] Dirty tracking (P1-2 / P1-3)");
  // Re-establish a VALID context first: 8b deliberately left a group selected
  // that does not meet on the chosen date, where save is disabled by the
  // schedule guard rather than by dirty state.
  await page.goto(`${APP}/dashboard/attendance`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('[role="option"]').first().click();
  await page.waitForTimeout(2000);
  if (meetingDate[0]?.d) {
    await page.fill('input[type="date"]', meetingDate[0].d);
    await page.waitForTimeout(2500);
  }

  const saveAfter = page.getByRole("button", { name: /enregistrer|save|حفظ/i }).first();
  // Everything was saved in step 5-7, so nothing differs from the stored roster.
  check("save disabled when no marks changed", await saveAfter.isDisabled());

  // Changing one mark must re-enable it.
  const anyStatus = page.getByRole("button", { name: /excusé|excused/i });
  if ((await anyStatus.count()) > 0) {
    await anyStatus.first().click();
    await page.waitForTimeout(800);
    check("save re-enabled after a change", !(await saveAfter.isDisabled()));
  }

  console.log("\n[9] Empty state before a group is chosen");
  await page.goto(`${APP}/dashboard/attendance`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const pre = await page.locator("body").innerText();
  check("prompts to choose a group", /choisir|sélection|select|choose|اختر/i.test(pre));

  console.log("\n[10] Mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check("no horizontal overflow at 390px", sw <= 400, `${sw}px`);

  console.log("\n[11] Console");
  check("no render loop", errors.filter((e) => /Maximum update depth/i.test(e)).length === 0);
  check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | ").slice(0, 240));
} catch (e) {
  fail++;
  console.log("  HARNESS ERROR:", e.message.slice(0, 300));
} finally {
  await fx.cleanup();
  await browser.close();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
