/**
 * TEST RUN — uses completely made-up data, signs up for a currently-open date.
 */
const { chromium } = require('playwright');
const { fillForm, SUBMIT_SELECTOR } = require('./fill-form');

const FAKE = {
  firstName:     'Alex',
  lastName:      'Donovan',
  preferredName: 'Alex',
  email:         'alex.donovan.testonly@mailinator.com',
  phone:         '5555550199',
  smsYes:        false,
  dobMonth:      '06',
  dobDay:        '14',
  dobYear:       '2007',
  schoolName:    'Lincoln High School',
  country:       'United States',
  street:        '456 Elm Street',
  city:          'Portland',
  state:         'Oregon',
  postalCode:    '97201',
  hasGuest:      false,
  submittedApplication: false,
  expectedTerm:  'Fall 2027',
  studentType:   'First-Year Student',
  campus:        'New York',
  academicInterest: 'Biology',
  genderIdentity:   'Man',
  citizenship:      'United States',
};

function log(msg) { console.log(`${new Date().toISOString()} ${msg}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  log('Navigating to tour portal…');
  await page.goto('https://connect.nyu.edu/portal/nyuvisit_tours', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Advance to April
  await page.click('.ui-datepicker-next:not(.ui-state-disabled)');
  await page.waitForTimeout(1000);

  // Find first date with class "available"
  const availableDay = await page.evaluate(() => {
    for (const td of document.querySelectorAll('.ui-datepicker-calendar td')) {
      const a = td.querySelector('a');
      if (a && td.className.split(' ').includes('available')) return a.textContent.trim();
    }
    return null;
  });

  if (!availableDay) {
    log('No available dates in April — aborting.');
    await browser.close();
    return;
  }

  log(`Clicking April ${availableDay}`);
  await page.evaluate((day) => {
    for (const td of document.querySelectorAll('.ui-datepicker-calendar td')) {
      const a = td.querySelector('a');
      if (a && a.textContent.trim() === day) { a.click(); return; }
    }
  }, availableDay);
  await page.waitForTimeout(2000);

  const regLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter(a => a.href.includes('/register/'))
      .map(a => a.href)
  );
  log(`Found ${regLinks.length} slot(s)`);

  let openLink = null;
  for (const link of regLinks) {
    const check = await browser.newPage();
    await check.goto(link, { waitUntil: 'networkidle' });
    await check.waitForTimeout(800);
    const text = await check.evaluate(() => document.body.innerText);
    const isOpen = !text.includes('no longer available');
    log(`  ${link} — ${isOpen ? 'OPEN' : 'closed'}`);
    await check.close();
    if (isOpen) { openLink = link; break; }
  }

  if (!openLink) {
    log('All slots closed — nothing to test against.');
    await browser.close();
    return;
  }

  log(`Opening: ${openLink}`);
  const rPage = await browser.newPage();
  await rPage.goto(openLink, { waitUntil: 'networkidle' });
  await rPage.waitForTimeout(1500);

  log('Filling form…');
  await fillForm(rPage, FAKE);

  log('Submitting…');
  await rPage.locator(SUBMIT_SELECTOR).click();
  await rPage.waitForTimeout(4000);

  const result = await rPage.evaluate(() => document.body.innerText);
  log('Result:\n' + result.substring(0, 600));

  await browser.close();
})();
