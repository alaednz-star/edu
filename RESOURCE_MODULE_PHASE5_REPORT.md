# Ressources pédagogiques — Phase 5 Report

**Date:** 2026-08-12
**Branch:** `resources/phase1-foundation` (not merged, not pushed, not deployed)
**Migrations:** none. Phase 5 is entirely application-level.

---

## 0. Scope, and how it was chosen

There is still no Phase 5 brief. Scope came from reconciling
`RESOURCE_MODULE_TASKS.md` against the code, which turned up a tracker that was
misleading in both directions — several items listed as unstarted had shipped in
Phase 2/3, and several ticked areas had real gaps left.

| Candidate | Already implemented? | Actually missing? | Depends on | Next? |
|---|---|---|---|---|
| Role selector / ordering / badges | **Yes**, Phase 2 | — | — | no |
| Duplicate filename → replace / keep both | **Yes**, Phase 3 | — | — | no |
| Multi-selection, bulk actions | **Yes**, Phase 3 | — | — | no |
| Real upload progress, cancel, retry | No | **Yes** | — | **yes** |
| Quota display | Enforcement only | **Yes** | Phase 1 functions | **yes** |
| Link provider detection, YouTube embed | No | **Yes** | Phase 1 columns | **yes** |
| "Lecture en ligne uniquement" label | Enforcement only | **Yes** | Phase 1 | **yes** |
| 44px touch targets, measured | Never measured | **Yes** | — | **yes** |
| Parallel uploads, floating tray | No | Yes | real progress | later |
| Student filters, image lightbox, video resume | No | Yes | — | later |
| Office preview | No | Yes | third-party viewer | later |
| Version history | No | Yes | schema design | later, §5 |
| Notification digest / reminders / preferences | No | Yes | Phase 4 | later, §5 |

The highest-value unfinished work was the **teacher's core loop** — getting a file
in — and the **most common link a teacher shares**. Both were visibly broken rather
than merely absent, which is why they came ahead of version history.

---

## 1. The upload told the truth

`onProgress(0.05)` then `onProgress(1)`. A teacher uploading a 200 MB video watched
a bar sit at 5% for two minutes and then jump. No cancel, no retry.

The upload now goes through `XMLHttpRequest` rather than `storage.upload()`. The SDK
wraps `fetch`, which reports nothing until the request completes; XHR is still the
only way a browser will say how many bytes have left. It is also what makes a real
cancel possible — `abort()` stops the transfer, where abandoning a promise leaves the
bytes flowing. The request carries the caller's JWT, so storage RLS decides exactly
as before.

Cancel and retry hang off an `AbortController` held in a **ref**: a handler closing
over state would abort a stale controller, the same shape of bug the drag-and-drop
`targetRef` documents. A cancel reports as a cancel, not an error.

The header now reads the **measured** centre total against the real 5 GB limit, from
the same functions the upload path enforces with — so the number shown is the number
that will refuse the next upload. It used to be a client-side sum of the rows on
screen, which shrank when a filter was applied.

---

## 2. Links stopped sending students to youtube.com

A YouTube link was broken twice. In the preview it went into an `<iframe>`, and
YouTube answers a watch URL with `X-Frame-Options: SAMEORIGIN` — the student saw a
refused-to-connect box. On the student page it never reached the preview at all:
links opened a new tab, dropping a teenager onto youtube.com with its sidebar of
everything except the lesson.

`linkFaceOf` reads a URL and says what it is and how, or whether, to frame it.
YouTube resolves to `youtube-nocookie.com/embed/` — YouTube's own privacy-enhanced
host, which sets no tracking cookies until playback, and for a page of school
children that is the right default at no cost. Drive/Docs/Sheets/Slides resolve to
their `/preview` forms, Dropbox to `raw=1`, Vimeo to its player. OneDrive is
recognised and honestly reported as unframeable, so such a link opens rather than
rendering an error frame.

**Detection is by hostname**, never by scanning the URL for a substring. The unit
tests include `https://evil.test/youtube.com/watch?v=…`, which a substring match
would have framed against an attacker-controlled origin.

`link_provider` is derived on save, never taken from the form: it is a property of
the URL, and a client-supplied value could disagree with the link it describes.

`link_thumbnail_url` is **deliberately still unused**. Deriving it is trivial, but
rendering third-party thumbnails in a list would send every student's IP to Google
on page load, and there is no in-product need yet. Populating a column nothing reads
is what left it dead in the first place.

---

## 3. Two things a student could not have known

- **Why there is no download button.** `allow_download = false` has been enforced
  server-side since Phase 1, but silence looks like a bug — a student assumes the
  button is missing, not withheld. The preview footer now says *"Lecture en ligne
  uniquement"* where the button would have been.
- **Whether a control is tappable.** Measured, not asserted.

### Touch targets, measured at 375px

`scripts/e2e/verify-resources-touch-targets.mjs` reports the rendered box of every
visible interactive element on both pages, in French and Arabic. Three real failures,
found only by geometry:

| Control | Was | Now |
|---|---|---|
| Chapter expand/collapse | **20px** tall | 44px |
| Chapitres / Liste toggle (teacher) | 24px | 36px |
| Chapitres / Liste toggle (student) | 24px | 36px |

The chapter toggle was the smallest control on the page and the primary one for
navigating an outline on a phone. Its height came from the text; the padding lived on
the row around it.

Smallest in-scope dimension is now 32px, and the script fails below that.

**One finding left deliberately unfixed:** the shared sidebar toggle measures
**28×28** on every page of the product. It lives in `src/components/layout/`, is not
a Resources dependency, and changing shared layout geometry would move every other
suite's measurements — so the script reports it under "OUT OF SCOPE, reported not
ignored" rather than silently excluding it. Your call.

---

## 4. Verification

| Suite | Result |
|---|---|
| Phase 1 API / browser | **43/43** · **21/21** |
| Phase 2 API / browser | **30/30** · **41/41** |
| Phase 3 API / browser | **39/39** · **38/38** |
| Phase 4 API / browser | **29/29** · **19/19** |
| **Phase 5 browser** | **29/29** |
| **Touch targets** | in-scope floor clear; one shared-shell finding reported |
| Unit | **108/108** (95 + 13 new) |
| TypeScript · ESLint · Build | clean · clean · passes |

No migration, so no rehearsal was needed. Security is untouched: no RLS change, no
policy replaced, no service-role path added. The XHR upload carries the user's JWT
and is refused by the same storage policy as before.

### Making the test deterministic rather than lucky

A 24 MB upload over loopback finished before any intermediate progress value could
be sampled and before a cancel could land — both assertions failed for environmental
reasons. The suite now throttles the upload to 512 kB/s over CDP, which is
deterministic and happens to be the condition the feature exists for.

### Bugs found by verifying, not by reading

1. **`Progress` never forwarded `value` to the Radix root**, so every progress bar in
   the product had `role="progressbar"` with **no `aria-valuenow`**. The fill looked
   right, so nothing pointed at it — invisible to a screen reader, unreadable to a
   test. App-wide, one line.
2. **Two buttons read "Annuler"** in the same dialog — the footer's and the new upload
   control. My own test clicked the wrong one, which closed the dialog and made the
   database assertions pass for entirely the wrong reason. The upload control is now
   "Interrompre", with an explicit `aria-label`.
3. **Dismissing the dialog mid-upload** abandoned the promise but left the XHR
   running: the object landed in the bucket minutes later with no row pointing at it,
   an orphan still counting against the quota. Closing now aborts.
4. **The teacher page also threw links to a new tab** — which is the only way for a
   teacher to see what the student will see. Both pages now preview in place.

Points 1–3 are each the kind of thing that survives code review indefinitely.

---

## 5. Remaining genuine issues

Unchanged from Phase 4 unless noted.

1. **No version history for replaced files.** Replace is still delete-then-create.
   Needs a `resource_versions` table (filename, size, storage object, uploader,
   timestamp, reason) and a decision on whether events follow the resource or the
   version. A design, not an increment.
2. **No notification digest.** `deliver_at` makes collapsing a burst possible; what a
   student should see is a product decision.
3. **A withdrawn-then-republished resource does not re-notify** if its first notice
   was delivered. Idempotency working as designed; worth a decision.
4. **"Relancer les élèves"** — the not-opened list exists; sending does not.
5. **No notification preferences.**
6. **Upload is still one file at a time.** Parallel uploads (max 3), drag-and-drop
   onto the dialog, and a floating tray that survives closing it are unbuilt. Real
   progress and cancel were the prerequisites and are now in place.
7. **Student-side filters** (subject / teacher / file type / sort), **image lightbox**
   and **video resume position** remain unbuilt.
8. **Office preview** would need a third-party viewer; not attempted.
9. **The shared sidebar toggle is 28×28** — §3.

---

**NOT MERGED / NOT PUSHED / NOT DEPLOYED.**
