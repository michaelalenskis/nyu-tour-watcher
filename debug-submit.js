/**
 * Debug: full result + academic interest check
 */
const { chromium } = require('playwright');
const { fillForm, SUBMIT_SELECTOR } = require('./fill-form');

const FAKE = {
  firstName: 'Alex', lastName: 'Donovan', preferredName: 'Alex',
  email: 'alex.donovan.testonly@mailinator.com', phone: '5555550199',
  smsYes: false, dobMonth: '06', dobDay: '14', dobYear: '2007',
  schoolName: 'Lincoln High School',
  country: 'United States', street: '456 Elm Street', city: 'Portland',
  state: 'Oregon', postalCode: '97201',
  hasGuest: false, submittedApplication: false,
  expectedTerm: 'Fall 2027', studentType: 'First-Year Student',
  campus: 'New York', academicInterest: 'Biology',
  genderIdentity: 'Man', citizenship: 'United States',
};

function log(msg) { console.log(`${new Date().toISOString()} ${msg}`); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Safari/537.36',
  });
  const rPage = await ctx.newPage();

  rPage.on('request', req => {
    if (req.url().includes('connect.nyu.edu') && req.method() === 'POST')
      log(`→ POST ${req.url().substring(0, 120)}  ${(req.postData() || '').substring(0, 150)}`);
  });
  rPage.on('response', async resp => {
    if (resp.url().includes('connect.nyu.edu/register') && resp.request().method() === 'POST') {
      log(`← ${resp.status()} ${resp.url().substring(0, 120)}`);
      try { log(`  body: ${(await resp.text()).substring(0, 600)}`); } catch (_) {}
    }
  });

  const OPEN_URL = 'https://connect.nyu.edu/register/?id=67628ad4-110b-4c6b-b1c0-d8bc99ce57fa';
  await rPage.goto(OPEN_URL, { waitUntil: 'networkidle' });
  await rPage.waitForTimeout(1500);

  await fillForm(rPage, FAKE);

  // Check form validity and radio/select states BEFORE submit
  const preState = await rPage.evaluate(() => {
    const form = document.querySelector('form[action*="register"]');
    const invalids = Array.from(form?.querySelectorAll(':invalid') || [])
      .filter(el => el.tagName !== 'FIELDSET')
      .map(el => ({ id: el.id.substring(0, 40), value: el.value, msg: el.validationMessage }));
    const radioState = {};
    for (const r of document.querySelectorAll('input[type="radio"]')) {
      if (r.checked) {
        const lbl = document.querySelector(`label[for="${r.id}"]`);
        radioState[r.name.substring(0, 30)] = lbl?.textContent.trim();
      }
    }
    // Academic interest state
    const aiSel = document.querySelector('[id*="f6049939"]');
    return {
      invalids,
      radioState,
      academicInterest: { id: aiSel?.id, disabled: aiSel?.disabled, visible: aiSel?.offsetParent !== null, value: aiSel?.value }
    };
  });
  log('Pre-submit state: ' + JSON.stringify(preState, null, 2));

  log('Submitting…');
  await rPage.locator(SUBMIT_SELECTOR).click();
  await rPage.waitForTimeout(5000);

  const result = await rPage.evaluate(() => document.body.innerText);
  log('Full result (1200 chars):\n' + result.substring(0, 1200));

  await browser.close();
})();
