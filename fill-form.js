/**
 * Shared form-filling logic — used by both test-run.js and watcher.js
 */

async function fillForm(page, u) {
  // ── 1. Trigger the sk session-key fetch by clicking on the form (fires focusin) ─
  // FW.Lazy.Commit will call cmd=sk again on submit, so we trigger it once here
  // via natural browser focus so the server sees the full interaction sequence.
  await page.locator('input[type="text"]:not([disabled])').first().click();
  await page.waitForTimeout(1500);
  console.log(`${new Date().toISOString()}   focusin triggered for sk`);

  // ── 2. Get address-widget base ID from DOM ────────────────────────────────
  const addrBase = await page.evaluate(() => {
    for (const el of document.querySelectorAll('[id$="_city"]'))
      if (el.id.includes('form_')) return el.id.replace('_city', '');
    return null;
  });
  console.log(`${new Date().toISOString()}   address base: ${addrBase}`);

  // ── 3. Fill all fields via DOM manipulation ───────────────────────────────
  await page.evaluate((d) => {
    function setVal(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Find first non-disabled input/select whose label contains text (skipping labels that contain skipWords)
    function byLabel(text, skipWords = [], tag = null) {
      for (const lbl of document.querySelectorAll('label')) {
        const t = lbl.textContent;
        if (!t.includes(text)) continue;
        if (skipWords.some(w => t.includes(w))) continue;
        const id = lbl.getAttribute('for');
        if (!id) continue;
        const el = document.getElementById(id);
        if (!el || el.disabled) continue;
        if (tag && el.tagName !== tag) continue;
        return el;
      }
      return null;
    }

    function pickOption(sel, optText) {
      if (!sel || sel.tagName !== 'SELECT') return;
      for (const opt of sel.options) {
        if (opt.text === optText) { setVal(sel, opt.value); return; }
      }
    }

    // Find radio inside a fieldset whose legend contains questionText, then click the one with radioLabel
    function checkInFieldset(questionText, radioLabel) {
      for (const fs of document.querySelectorAll('fieldset')) {
        const legend = fs.querySelector('legend');
        if (!legend || !legend.textContent.includes(questionText)) continue;
        for (const r of fs.querySelectorAll('input[type="radio"]')) {
          const lbl = document.querySelector(`label[for="${r.id}"]`);
          if (lbl && lbl.textContent.trim() === radioLabel) { r.click(); return true; }
        }
      }
      return false;
    }

    // ── Personal info ─────────────────────────────────────────────────────
    setVal(byLabel('First/Given Name', ['Guest', 'Second']), d.firstName);
    setVal(byLabel('Last/Family Name',  ['Guest', 'Second']), d.lastName);
    setVal(byLabel('Preferred Name'),   d.preferredName ?? '');
    setVal(byLabel('Email Address',     ['Guest', 'Second']), d.email);
    setVal(byLabel('Phone Number'),     d.phone);

    // SMS
    checkInFieldset('SMS', d.smsYes ? 'Yes' : 'No') ||
      checkInFieldset('text message', d.smsYes ? 'Yes' : 'No');

    // ── Birthday ──────────────────────────────────────────────────────────
    const months = ['','January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    let bdBase = null;
    for (const s of document.querySelectorAll('select'))
      if (s.id.endsWith('_m')) { bdBase = s.id.slice(0, -2); break; }
    if (bdBase) {
      pickOption(document.getElementById(bdBase + '_m'), months[parseInt(d.dobMonth, 10)]);
      pickOption(document.getElementById(bdBase + '_d'), String(parseInt(d.dobDay, 10)));
      pickOption(document.getElementById(bdBase + '_y'), d.dobYear);
    }
    // Mark "Set" radio
    for (const r of document.querySelectorAll('input[type="radio"]')) {
      const lbl = document.querySelector(`label[for="${r.id}"]`);
      if (lbl && lbl.textContent.trim() === 'Set') { r.click(); break; }
    }

    // ── School name ───────────────────────────────────────────────────────
    setVal(byLabel('Current School Name'), d.schoolName);

    // ── Guests ────────────────────────────────────────────────────────────
    if (d.hasGuest) {
      checkInFieldset('guest', 'Yes - One Guest');
    } else {
      checkInFieldset('guest', 'No');
    }

    // ── Application submitted ─────────────────────────────────────────────
    checkInFieldset('submitted an', d.submittedApplication ? 'Yes' : 'No') ||
      checkInFieldset('application', d.submittedApplication ? 'Yes' : 'No');

    // ── Optional ──────────────────────────────────────────────────────────
    pickOption(byLabel('Gender Identity', ['Description'], 'SELECT'), d.genderIdentity ?? '');
    pickOption(byLabel('Country of Citizenship', [], 'SELECT'), d.citizenship ?? '');

    // ── Terms checkboxes — check ALL unchecked checkboxes on the page ──────
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      if (!cb.checked && !cb.disabled) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        cb.dispatchEvent(new Event('input',  { bubbles: true }));
      }
    }

  }, u);

  await page.waitForTimeout(300);

  // ── 4. School autocomplete ────────────────────────────────────────────────
  await page.waitForTimeout(2000);
  try {
    const suggestion = page
      .locator('.ui-autocomplete li, ul[class*="suggest"] li, ul[class*="auto"] li, [class*="result"] li')
      .filter({ hasText: u.schoolName.split(' ')[0] }).first();
    await suggestion.waitFor({ timeout: 2500 });
    await suggestion.click();
    console.log(`${new Date().toISOString()}   selected school autocomplete`);
  } catch (_) {
    console.log(`${new Date().toISOString()}   no autocomplete — school left as typed`);
  }

  // ── 5. Address widget — fill sub-fields by ID ─────────────────────────────
  if (addrBase) {
    await page.evaluate((d) => {
      function setVal(el, value) {
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function pickOption(sel, optText) {
        if (!sel || sel.tagName !== 'SELECT') return;
        for (const opt of sel.options) {
          if (opt.text === optText) { setVal(sel, opt.value); return; }
        }
      }
      // Try multiple possible sub-field names for street
      setVal(document.getElementById(d.addrBase + '_address1')
          || document.getElementById(d.addrBase + '_street')
          || document.getElementById(d.addrBase + '_addr1'), d.street);
      setVal(document.getElementById(d.addrBase + '_city'),   d.city);
      setVal(document.getElementById(d.addrBase + '_postal'), d.postalCode);
      pickOption(document.getElementById(d.addrBase + '_region'),  d.state);
      pickOption(document.getElementById(d.addrBase + '_country'), d.country);
    }, { addrBase, ...u });
    console.log(`${new Date().toISOString()}   filled address widget`);
  }

  // ── 6. Guest fields (enabled after choosing Yes - One Guest) ──────────────
  if (u.hasGuest) {
    await page.waitForTimeout(500);
    await page.evaluate((d) => {
      function setVal(el, v) { if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
      function byLabel(text, skip = []) {
        for (const lbl of document.querySelectorAll('label')) {
          const t = lbl.textContent;
          if (!t.includes(text)) continue;
          if (skip.some(w => t.includes(w))) continue;
          const el = document.getElementById(lbl.getAttribute('for'));
          if (!el || el.disabled) continue;
          return el;
        }
        return null;
      }
      setVal(byLabel('Guest First/Given Name', ['Second']), d.guestFirst);
      setVal(byLabel('Guest Last/Family Name',  ['Second']), d.guestLast);
      setVal(byLabel('Guest Email Address',     ['Second']), d.guestEmail);
    }, u);
  }

  // ── 7. Conditional academic fields — use Playwright to trigger JS events ──
  // Expected Term of Entry (triggers First-Year/Transfer becoming active)
  try {
    const termLabel = await page.evaluate(() => {
      for (const lbl of document.querySelectorAll('label'))
        if (lbl.textContent.includes('Expected Term of Entry')) return lbl.getAttribute('for');
    });
    if (termLabel) {
      await page.locator(`#${termLabel}`).selectOption({ label: u.expectedTerm });
      console.log(`${new Date().toISOString()}   selected Expected Term`);
      await page.waitForTimeout(600);
    }
  } catch (e) { console.log(`${new Date().toISOString()}   WARN Expected Term: ${e.message}`); }

  // Student type (First-Year / Transfer) — now enabled after Expected Term
  try {
    await page.evaluate((label) => {
      for (const r of document.querySelectorAll('input[type="radio"]')) {
        const lbl = document.querySelector(`label[for="${r.id}"]`);
        if (lbl && lbl.textContent.trim() === label && !r.disabled) { r.click(); return; }
      }
    }, u.studentType);
    console.log(`${new Date().toISOString()}   checked student type`);
    await page.waitForTimeout(600);
  } catch (e) { console.log(`${new Date().toISOString()}   WARN student type: ${e.message}`); }

  // Campus (New York / Abu Dhabi / Shanghai) — wait for campus radios to be enabled first
  try {
    await page.waitForFunction(() => {
      for (const r of document.querySelectorAll('input[type="radio"]')) {
        const lbl = document.querySelector(`label[for="${r.id}"]`);
        if (lbl && (lbl.textContent.trim() === 'New York' || lbl.textContent.trim() === 'Abu Dhabi' || lbl.textContent.trim() === 'Shanghai') && !r.disabled)
          return true;
      }
      return false;
    }, { timeout: 8000 }).catch(() => {});
    await page.evaluate((label) => {
      for (const r of document.querySelectorAll('input[type="radio"]')) {
        const lbl = document.querySelector(`label[for="${r.id}"]`);
        if (lbl && lbl.textContent.trim() === label && !r.disabled) { r.click(); return; }
      }
    }, u.campus);
    console.log(`${new Date().toISOString()}   checked campus`);
    await page.waitForTimeout(1000);
  } catch (e) { console.log(`${new Date().toISOString()}   WARN campus: ${e.message}`); }

  // Academic Interest (visible after choosing NY campus) — wait for it to become enabled
  try {
    const intLabel = await page.evaluate(() => {
      for (const lbl of document.querySelectorAll('label'))
        if (/New York Academic Interest/i.test(lbl.textContent)) return lbl.getAttribute('for');
    });
    if (intLabel) {
      await page.waitForFunction((id) => {
        const el = document.getElementById(id);
        return el && !el.disabled && el.offsetParent !== null;
      }, intLabel, { timeout: 8000 }).catch(() => {});
      await page.locator(`#${intLabel}`).selectOption({ label: u.academicInterest });
      console.log(`${new Date().toISOString()}   selected academic interest`);
    }
  } catch (e) { console.log(`${new Date().toISOString()}   WARN academic interest: ${e.message}`); }

  console.log(`${new Date().toISOString()}   form fill complete`);

  // ── 8. Install route to delay cmd=submit by 4s so sk token is old enough ─────
  // The server requires ≥3s between sk issuance and use; FW.Lazy.Commit fires
  // cmd=sk then cmd=submit in ~0.3s, so we intercept cmd=submit and hold it.
  await page.route('**/register/**', async (route) => {
    const url = route.request().url();
    if (url.includes('cmd=submit')) {
      console.log(`${new Date().toISOString()}   delaying cmd=submit 4s for sk age check…`);
      await new Promise(r => setTimeout(r, 4000));
    }
    await route.continue();
  });
}

// Submit button selector (it's type="button", not type="submit")
const SUBMIT_SELECTOR = 'button.form_button_submit';

module.exports = { fillForm, SUBMIT_SELECTOR };
