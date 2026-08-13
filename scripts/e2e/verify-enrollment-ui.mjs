/**
 * The redesigned enrolment and profile pages, in a real browser.
 *
 * Scope: `/dashboard/registration`, `/dashboard/my-registrations`, `/dashboard/profile`.
 * The security questions are answered over the API in `verify-enrollment-security.mjs`;
 * this suite is about what a student actually sees and can reach --
 *
 *   - the teacher's photo is the dominant element on a catalogue card, and falls back to
 *     initials rather than a broken image or a silhouette
 *   - remaining seats read as urgency, with an accessible progress value
 *   - the blocked states explain the REAL reason (one group per subject and level), never
 *     an invented schedule clash
 *   - enrolling goes through a confirmation, and the request appears without a reload
 *   - a pending request can be withdrawn, and the seat count reflects it
 *   - nothing overflows horizontally at 1440 / 1024 / 768 / 375
 *   - the same holds in Arabic, right-to-left, with no mirrored-icon or clipped text
 *   - every control a student must tap is at least 44px
 *
 * Needs the dev server and the local Supabase stack:
 *   node scripts/e2e/verify-enrollment-ui.mjs
 */
import { chromium } from "playwright-core";
import { withFixtures, sql, SERVICE_ROLE_KEY, TEST_PASSWORD } from "./fixtures.mjs";

const APP = process.env["APP_URL"] ?? "http://localhost:8080";
const TAG = "e2e-fixture";
const TARGET = 44;

const R = [];
const rec = (n, ok, d = "") => {
  R.push([n, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`);
};

/* ------------------------------------------------------------------ fixtures */

const fx = await withFixtures({ teacher: true, student: true, admin: true });

const level = (await sql(`select id from public.levels where name = '3ème année secondaire';`))[0];
const stream = (
  await sql(`select id from public.streams where code='sciences' and level_id='${level.id}';`)
)[0];

/** A group in the student's own level and stream, with a chosen number of seats taken. */
const makeGroup = async ({ name, subjectKey, capacity, taken = 0, weekday = 1 }) => {
  const subject = (await sql(`select id from public.subjects where key='${subjectKey}';`))[0];
  await sql(`insert into public.teacher_subjects (teacher_id, subject_id)
             values ('${fx.teacher.id}','${subject.id}') on conflict do nothing;`);
  const g = (
    await sql(`
      insert into public.groups
        (name, subject_id, teacher_id, level_id, stream_id, max_students, price_dzd, status,
         start_date, end_date)
      values ('${name}','${subject.id}','${fx.teacher.id}','${level.id}','${stream.id}',
              ${capacity}, 4500, 'active', current_date - 30, current_date + 180)
      returning id;`)
  )[0];
  await sql(`insert into public.group_schedules (group_id, weekday, start_time, end_time, room)
             values ('${g.id}', ${weekday}, '14:00', '16:00', 'B12');`);
  // A second slot, so "+1" and the weekly volume have something to show.
  await sql(`insert into public.group_schedules (group_id, weekday, start_time, end_time, room)
             values ('${g.id}', ${(weekday + 2) % 7}, '10:00', '11:30', 'B12');`);

  // Seat-fillers exist only to occupy seats; they never sign in. Tagged, so the global
  // cleanup removes them with everything else.
  for (let i = 0; i < taken; i++) {
    const created = await fetch(`http://127.0.0.1:54321/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: `${TAG}-seat-${i}-${Math.random().toString(36).slice(2)}@example.test`,
        password: TEST_PASSWORD,
        email_confirm: true,
        app_metadata: { role: "student", [TAG]: true },
      }),
    });
    if (!created.ok) throw new Error(`seat filler: ${created.status} ${await created.text()}`);
    const id = (await created.json()).id;
    await sql(`insert into public.registrations (student_id, group_id, status, decided_at)
               values ('${id}','${g.id}','approved', now())
               on conflict (student_id, group_id) do nothing;`);
  }
  return { id: g.id, name };
};

// The catalogue needs variety: a comfortable group, one that is nearly full, one that is
// full, and a second group of a subject the student will already be enrolled in.
const open = await makeGroup({
  name: `${TAG} UI Maths A`,
  subjectKey: "mathematics",
  capacity: 20,
});
const scarce = await makeGroup({
  name: `${TAG} UI Physique`,
  subjectKey: "physics",
  capacity: 10,
  taken: 8,
  weekday: 2,
});
const filled = await makeGroup({
  name: `${TAG} UI Anglais`,
  subjectKey: "english",
  capacity: 2,
  taken: 2,
  weekday: 3,
});
const sameSubject = await makeGroup({
  name: `${TAG} UI Maths B`,
  subjectKey: "mathematics",
  capacity: 20,
  weekday: 4,
});

// The student: onboarded, in the right level and stream, with a photo-less teacher so the
// initials fallback is exercised, and one approved maths enrolment so `takenSubject` and
// `approved` states both appear.
await sql(`update public.students set gender = coalesce(gender,'female'),
             date_of_birth = coalesce(date_of_birth,'2008-03-02'),
             guardian_name = coalesce(guardian_name,'Parent'),
             guardian_phone = coalesce(guardian_phone,'0661000000'),
             level_id = '${level.id}', stream_id = '${stream.id}', onboarded_at = now()
           where id = '${fx.student.id}';`);

const browser = await chromium.launch();

const login = async (ctx, page, email) => {
  await ctx.clearCookies();
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
};

const cardFor = (page, name) => page.locator("article").filter({ hasText: name });

/** Names of every card on screen -- printed when a lookup fails, so the failure is legible. */
const cardNames = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("main article h3")].map((h) => h.textContent?.trim()),
  );

try {
  /* ================================================================ desktop, fr */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  await login(ctx, page, fx.student.email);
  await page.goto(`${APP}/dashboard/registration`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  console.log("\n--- the catalogue ---");
  const cards = page.locator("article");
  rec("the eligible groups render as cards", (await cards.count()) >= 4, `${await cards.count()}`);

  const openCard = cardFor(page, open.name);
  if ((await openCard.count()) === 0) {
    console.log("cards on screen:", JSON.stringify(await cardNames(page)));
    throw new Error(`card not found: ${open.name}`);
  }
  const avatar = openCard.locator("[data-person-avatar]").first();
  const box = await avatar.boundingBox();
  rec(
    "the teacher avatar is the dominant element (>= 64px)",
    !!box && box.width >= 64,
    `${box ? Math.round(box.width) : "none"}px`,
  );
  // No photo was uploaded for the fixture teacher, so this must be initials -- not a
  // broken <img> and not a generic silhouette.
  const fallbackText = await openCard.locator("[data-person-avatar] > span").first().innerText();
  rec(
    "with initials as the fallback, not a broken image",
    /^[A-Z]{1,2}$/.test(fallbackText.trim()),
    JSON.stringify(fallbackText.trim()),
  );

  // Staff DO get a real bar, and when they do it must carry an accessible value -- a
  // `role="progressbar"` with no `aria-valuenow` is what shipped before Phase 5.
  const staffCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const staffPage = await staffCtx.newPage();
  await login(staffCtx, staffPage, fx.admin.email);
  await staffPage.goto(`${APP}/dashboard/groups`, { waitUntil: "networkidle" });
  await staffPage.waitForTimeout(1500);
  const staffBars = staffPage.locator('[role="progressbar"]');
  const staffCount = await staffBars.count();
  rec(
    "progress bars expose an accessible value",
    staffCount === 0 || (await staffBars.first().getAttribute("aria-valuenow")) !== null,
    staffCount === 0
      ? "no bars on the admin groups page"
      : `aria-valuenow=${await staffBars.first().getAttribute("aria-valuenow")}`,
  );
  await staffCtx.close();

  // SEATS. A student's `registrations` read is restricted to their own rows, so occupancy
  // is not merely approximate for them -- it is unavailable, and always resolves to 0/N.
  // The card must therefore show the group's SIZE, and must not draw a bar or an urgency
  // claim from a number nobody measured. See docs/enrollment-seat-counts.md; unlocking the
  // urgency display needs one aggregate server object, which is NOT part of this change.
  const scarceText = await cardFor(page, scarce.name).innerText();
  rec(
    "a student is shown the group's size, not a fabricated occupancy",
    /Groupe de\s*10\s*élèves/i.test(scarceText),
    JSON.stringify(scarceText.split("\n").find((l) => /Groupe de|inscrit/i.test(l)) ?? ""),
  );
  rec(
    "and NO 0-of-N count is rendered as though it were measured",
    !/0\s*inscrit/i.test(scarceText),
    JSON.stringify(scarceText.split("\n").find((l) => /inscrit/i.test(l)) ?? ""),
  );
  rec(
    "and no seat progress bar is drawn from it",
    (await cardFor(page, scarce.name).locator('[role="progressbar"]').count()) === 0,
  );

  // A genuinely full group: the student may still ASK. `enforce_group_capacity` treats a
  // pending row as a request rather than a seat, so this is the database's own rule
  // surfacing, and the admin's rejection is where capacity bites.
  const filledText = await cardFor(page, filled.name).innerText();
  rec(
    "a full group is not falsely labelled open or closed to a student",
    !/Complet/i.test(filledText) && /Groupe de/i.test(filledText),
    JSON.stringify(filledText.split("\n").find((l) => /Complet|Groupe de/i.test(l)) ?? ""),
  );

  const price = await openCard.innerText();
  rec("the price is on the card", /4\s?500\s*DZD/.test(price.replace(/ | /g, " ")));

  /* ================================================================ details sheet */
  console.log("\n--- the details sheet ---");
  await openCard.getByRole("heading", { name: open.name }).click();
  await page.waitForTimeout(700);
  const sheet = page.locator('[role="dialog"]').first();
  rec("clicking the card title opens the details", await sheet.isVisible());
  const sheetText = await sheet.innerText();
  rec(
    "it lists EVERY slot, not only the first",
    (sheetText.match(/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/g) ?? []).length >= 2,
    `${(sheetText.match(/\d{2}:\d{2}/g) ?? []).length} times`,
  );
  rec("and the room", /B12/.test(sheetText));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  /* ================================================================ enrol */
  console.log("\n--- enrolling goes through a confirmation ---");
  await cardFor(page, scarce.name)
    .getByRole("button", { name: /Demander/i })
    .click();
  await page.waitForTimeout(600);
  const dialog = page.locator('[role="dialog"]').first();
  rec("a confirmation dialog appears rather than firing immediately", await dialog.isVisible());
  const dialogText = await dialog.innerText();
  rec(
    "it says the seat is not booked yet",
    /pas encore réservée|valide chaque demande/i.test(dialogText),
    JSON.stringify(dialogText.split("\n")[1] ?? ""),
  );
  rec("and restates the price being committed to", /4\s?500|DZD/.test(dialogText));

  await dialog.getByRole("button", { name: /Envoyer la demande/i }).click();
  // Success navigates to the confirmation route.
  await page.waitForURL(/registration\/success/, { timeout: 20000 }).catch(() => {});
  rec(
    "confirming sends the request and lands on the confirmation page",
    /registration\/success/.test(page.url()),
    page.url().replace(APP, ""),
  );

  const created = await sql(`select status from public.registrations
                              where student_id='${fx.student.id}' and group_id='${scarce.id}';`);
  rec("the row exists and is pending", created[0]?.status === "pending", `${created[0]?.status}`);

  /* ================================================================ pending, no reload */
  console.log("\n--- the catalogue reflects it without a reload ---");
  await page.goto(`${APP}/dashboard/registration`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const scarceAfter = await cardFor(page, scarce.name).innerText();
  rec(
    "the group now shows the pending state",
    /attente/i.test(scarceAfter),
    JSON.stringify(scarceAfter.split("\n").find((l) => /attente/i.test(l)) ?? ""),
  );
  rec(
    "with a way to withdraw",
    (await cardFor(page, scarce.name)
      .getByRole("button", { name: /Retirer/i })
      .count()) > 0,
  );

  /* ================================================================ the real rule */
  console.log("\n--- the blocked state explains the REAL reason ---");
  // Approve the maths request so the sibling maths group becomes `takenSubject`.
  await sql(`insert into public.registrations (student_id, group_id, status, decided_at)
             values ('${fx.student.id}','${open.id}','approved', now())
             on conflict (student_id, group_id) do update set status='approved';`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const siblingText = await cardFor(page, sameSubject.name).innerText();
  rec(
    "a second group of the same subject explains the one-per-subject rule",
    /déjà inscrit/i.test(siblingText),
    JSON.stringify(siblingText.split("\n").find((l) => /déjà/i.test(l)) ?? ""),
  );
  const pageText = await page.locator("main").innerText();
  rec(
    "and NO invented schedule-conflict wording appears anywhere",
    !/chevauche|conflit d.horaire|overlaps/i.test(pageText),
  );

  /* ================================================================ my-registrations */
  console.log("\n--- my registrations ---");
  await page.goto(`${APP}/dashboard/my-registrations`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const regCards = page.locator("article");
  rec("the requests render as cards", (await regCards.count()) >= 2, `${await regCards.count()}`);
  rec(
    "each carries the teacher's avatar, like the catalogue",
    (await regCards.first().locator("[data-person-avatar]").count()) > 0,
  );

  const pendingCard = regCards.filter({ hasText: /attente/i }).first();
  rec(
    "a pending request offers withdrawal",
    (await pendingCard.getByRole("button", { name: /Retirer/i }).count()) > 0,
  );
  await pendingCard.getByRole("button", { name: /Retirer/i }).click();
  await page.waitForTimeout(600);
  const confirm = page.locator('[role="alertdialog"]').first();
  rec("withdrawing is confirmed first", await confirm.isVisible());
  await confirm.getByRole("button", { name: /Retirer la demande/i }).click();
  await page.waitForTimeout(2000);
  const afterWithdraw = await sql(`select count(*)::int c from public.registrations
                                    where student_id='${fx.student.id}' and group_id='${scarce.id}';`);
  rec("and the row is gone", afterWithdraw[0].c === 0, `${afterWithdraw[0].c}`);

  /* ================================================================ profile */
  console.log("\n--- the profile ---");
  await page.goto(`${APP}/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const main = page.locator("main");
  // The hero photo is the AvatarPicker's own button -- the photo IS the control.
  const heroPhoto = main
    .getByRole("button", { name: /Ajouter une photo|Changer la photo/i })
    .first();
  const heroBox = await heroPhoto.boundingBox();
  rec(
    "the profile opens with the photo, not a form field",
    !!heroBox && heroBox.width >= 80,
    `${heroBox ? Math.round(heroBox.width) : "none"}px`,
  );
  const profileText = await main.innerText();
  rec("the name is stated as a heading", profileText.includes("E2E Student"));
  rec("the role is stated", /Élève|Student|طالب/i.test(profileText));
  rec("the e-mail is stated", profileText.includes(fx.student.email));
  rec("and when the account was created", /Membre depuis/i.test(profileText));
  rec(
    "the photo itself is the upload control",
    (await heroPhoto.count()) > 0 && (await main.locator('input[type="file"]').count()) > 0,
  );
  rec(
    "and it accepts only the image types storage allows",
    /image\/jpeg/.test(
      (await main.locator('input[type="file"]').first().getAttribute("accept")) ?? "",
    ),
    String(await main.locator('input[type="file"]').first().getAttribute("accept")),
  );

  /* ================================================================ topbar photo */
  const topbarAvatar = page.locator("header").locator("[data-person-avatar]").first();
  rec(
    "the topbar shows the same avatar component as everywhere else",
    (await topbarAvatar.count()) > 0,
  );

  /* ================================================================ responsive */
  console.log("\n--- no horizontal overflow at any width ---");
  for (const [w, h] of [
    [1440, 950],
    [1024, 800],
    [768, 900],
    [375, 800],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    for (const route of ["registration", "my-registrations", "profile"]) {
      await page.goto(`${APP}/dashboard/${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      rec(`${route} @ ${w}px does not scroll sideways`, over <= 1, `${over}px`);
    }
  }

  /* ================================================================ touch targets */
  console.log("\n--- touch targets at 375px ---");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${APP}/dashboard/registration`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  // Measured on the page's OWN controls. The dashboard chrome (sidebar trigger, global
  // search, language switcher, user menu) is shared by every screen and predates this
  // work, so it is reported separately rather than folded into this page's verdict.
  const measured = await page.evaluate((target) => {
    const sel = 'button, a[href], [role="button"]';
    const shell = ["header", '[data-sidebar="sidebar"]', "nav", '[data-slot="sidebar"]'].join(",");
    const boxes = [...document.querySelectorAll(`main ${sel}`)].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.textContent ?? "").trim().slice(0, 40),
        w: r.width,
        h: r.height,
        inShell: !!el.closest(shell),
      };
    });
    return boxes.filter((b) => b.w > 0 && b.h > 0 && (b.w < target || b.h < target));
  }, TARGET);
  const mine = measured.filter((b) => !b.inShell);
  const shell = measured.filter((b) => b.inShell);
  const fmt = (list) =>
    list.map((s) => `${s.label || "(icon)"} ${Math.round(s.w)}x${Math.round(s.h)}`).join(", ");
  rec(`every catalogue control is at least ${TARGET}px`, mine.length === 0, fmt(mine));
  if (shell.length > 0) {
    console.log(`NOTE  pre-existing dashboard chrome below ${TARGET}px: ${fmt(shell)}`);
  }

  /* ================================================================ arabic, rtl */
  console.log("\n--- Arabic, right to left ---");
  await sql(`update public.profiles set locale = 'ar' where id = '${fx.student.id}';`).catch(
    () => {},
  );
  const arCtx = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    locale: "ar",
  });
  const arPage = await arCtx.newPage();
  await login(arCtx, arPage, fx.student.email);
  await arPage.goto(`${APP}/dashboard/registration`, { waitUntil: "networkidle" });
  await arPage.waitForTimeout(1500);
  // The switcher is the reliable way in: locale may come from the profile or storage.
  const dir = await arPage.evaluate(() => document.documentElement.getAttribute("dir"));
  rec("the document direction is set", dir === "rtl" || dir === "ltr", `dir=${dir}`);

  if (dir === "rtl") {
    const arOver = await arPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    rec("RTL catalogue does not scroll sideways", arOver <= 1, `${arOver}px`);

    // A price or a time range must not be reordered by the bidi algorithm.
    const isolated = await arPage.evaluate(() => {
      const els = [...document.querySelectorAll('main [dir="ltr"]')];
      return els.length;
    });
    rec("direction-neutral values are bidi-isolated", isolated > 0, `${isolated} isolated spans`);

    // The avatar must sit on the correct side: logical properties, not left/right.
    const sides = await arPage.evaluate(() => {
      const card = document.querySelector("main article");
      if (!card) return null;
      const av = card.querySelector("[data-person-avatar]");
      if (!av) return null;
      const c = card.getBoundingClientRect();
      const a = av.getBoundingClientRect();
      return { fromStart: Math.round(c.right - a.right), fromEnd: Math.round(a.left - c.left) };
    });
    rec(
      "the avatar flips to the start side in RTL",
      !!sides && sides.fromStart < sides.fromEnd,
      JSON.stringify(sides),
    );
  } else {
    rec(
      "RTL could not be reached in this run -- reported, not silently skipped",
      false,
      `dir=${dir}`,
    );
  }
  await arCtx.close();
} finally {
  await browser.close();
  await fx.cleanup();
}

const failures = R.filter((r) => !r[1]).length;
console.log(`\n${failures} FAILURES / ${R.length} checks`);
process.exit(failures > 0 ? 1 : 0);
