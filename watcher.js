const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fillForm, SUBMIT_SELECTOR } = require('./fill-form');

const DONE_FILE = path.join(__dirname, 'registered.done');
const LOG_FILE  = path.join(__dirname, 'watcher.log');

// ── User config ────────────────────────────────────────────────────────────────
const USER = {
  firstName:     'Lilah',
  lastName:      'Lenskis-Kristian',
  preferredName: 'Lilah',
  email:         'lilahsimone12@gmail.com',
  phone:         '9143567662',
  smsYes:              true,
  submittedApplication: true,
  dobMonth:      '01',   // January
  dobDay:        '23',
  dobYear:       '2008',
  schoolName:    'Ingraham High School',
  country:       'United States',
  street:        '10055 8th Ave NW Unit A',
  city:          'Seattle',
  state:         'Washington',
  postalCode:    '98177',
  hasGuest:      true,
  guestFirst:    'Dalia',
  guestLast:     'Lenskis',
  guestEmail:    'dalia_lenskis@yahoo.ca',
  expectedTerm:  'Fall 2026',
  studentType:   'First-Year Student',
  campus:        'New York',
  academicInterest: 'Global Public Health: Science',
  genderIdentity:   'Woman',
  citizenship:      'United States',
};
// ──────────────────────────────────────────────────────────────────────────────

function log(msg) {
  // console.log goes to watcher.log via launchd StandardOutPath — no extra appendFileSync needed
  console.log(`${new Date().toISOString()} ${msg}`);
}

function notify(title, body) {
  try {
    const safe = (s) => s.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${safe(body)}" with title "${safe(title)}" sound name "Glass"'`);
  } catch (_) {}
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  if (fs.existsSync(DONE_FILE)) {
    log('Already registered — exiting.');
    process.exit(0);
  }

  log('Checking April 9 availability…');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Safari/537.36',
  });
  try {
    const page = await ctx.newPage();
    await page.goto('https://connect.nyu.edu/portal/nyuvisit_tours', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);

    // Advance calendar to April
    await page.click('.ui-datepicker-next:not(.ui-state-disabled)');
    await page.waitForTimeout(1000);

    // Check April 9's CSS class — "available" means open slots, "unavailable" means tours exist but full
    const april9Class = await page.evaluate(() => {
      for (const td of document.querySelectorAll('.ui-datepicker-calendar td')) {
        const a = td.querySelector('a');
        if (a && a.textContent.trim() === '9') return td.className;
      }
      return null;
    });

    log(`April 9 class: "${april9Class}"`);

    // Check if April 9 exists on the calendar at all (has a link)
    const april9Exists = await page.evaluate(() => {
      for (const td of document.querySelectorAll('.ui-datepicker-calendar td')) {
        const a = td.querySelector('a');
        if (a && a.textContent.trim() === '9') return true;
      }
      return false;
    });

    if (!april9Exists) {
      log('April 9 not on calendar yet — will check again in 1 min.');
      await browser.close();
      process.exit(0);
    }

    // Click April 9 to load its slots (works whether class is "available" or "unavailable")
    await page.evaluate(() => {
      for (const td of document.querySelectorAll('.ui-datepicker-calendar td')) {
        const a = td.querySelector('a');
        if (a && a.textContent.trim() === '9') { a.click(); return; }
      }
    });
    await page.waitForTimeout(2000);

    // Collect all register links shown for April 9
    const regLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a'))
        .filter(a => a.href.includes('/register/'))
        .map(a => a.href)
    );

    log(`Found ${regLinks.length} slot(s) for April 9`);

    if (regLinks.length === 0) {
      log('No slots visible yet — will check again in 1 min.');
      await browser.close();
      process.exit(0);
    }

    let registered = false;
    for (const link of regLinks) {
      if (registered) break;

      const rPage = await ctx.newPage();
      try {
        await rPage.goto(link, { waitUntil: 'networkidle', timeout: 30_000 });
        await rPage.waitForTimeout(1500);

        const bodyText = await rPage.evaluate(() => document.body.innerText);
        if (bodyText.includes('Registration is no longer available') || bodyText.includes('no longer available')) {
          log(`Slot closed: ${link}`);
          await rPage.close();
          continue;
        }

        log(`Slot OPEN: ${link} — filling form…`);
        notify('NYU Tour', 'April 9 slot open — signing up now…');
        await fillForm(rPage, USER);

        log('Submitting…');
        await rPage.locator(SUBMIT_SELECTOR).click();
        await rPage.waitForTimeout(4000);

        const afterText = await rPage.evaluate(() => document.body.innerText);
        log('Post-submit page: ' + afterText.substring(0, 400));

        // Write done-file regardless of page content (form may redirect or show confirmation)
        const doneMsg = `Registered ${new Date().toISOString()} | slot: ${link}`;
        fs.writeFileSync(DONE_FILE, doneMsg);
        log('SUCCESS — ' + doneMsg);
        notify('NYU Tour — REGISTERED!', 'Signed up for April 9. Check lilahsimone12@gmail.com.');
        registered = true;

      } catch (err) {
        log(`Error on slot ${link}: ${err.message}`);
      } finally {
        await rPage.close();
      }
    }

    if (!registered) {
      log('All April 9 slots were closed — will check again in 1 min.');
    }

  } catch (err) {
    log(`Fatal error: ${err.message}`);
  } finally {
    await browser.close();
  }
})();

