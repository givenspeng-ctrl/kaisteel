// No network: production URLs are fulfilled from the checkout; providers are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const base = 'https://kaisteelkitchen.com';
const routes = [['/', '#rfq-form', '#rfq-status'], ['/australia-outdoor-kitchen-dealers/', '#dealer-form', '#dealer-status']];
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  try {
    for (const [pathname, formId, statusId] of routes) {
      const context = await browser.newContext({viewport: {width: 390, height: 844}});
      let posts = 0, mode = 'error', held, payload = '';
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'formspree.io') {
          posts++; payload = route.request().postData() || '';
          if (mode === 'hold') {held = route; return;}
          return route.fulfill({status: 500, body: '{}'});
        }
        if (url.origin !== base) return route.abort();
        const filename = path.join(root, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
        const contentType = filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html';
        try {return await route.fulfill({body: await fs.readFile(filename), contentType});} catch {return route.abort();}
      });
      const page = await context.newPage();
      const events = name => page.evaluate(n => window.dataLayer.filter(x => x[0] === 'event' && x[1] === n).length, name);
      await page.goto(base + pathname + '?utm_source=linkedin&utm_medium=organic_social&utm_campaign=au_dealer_pack&utm_content=week1_production_fitout&email=secret@example.invalid#private-message');
      const form = page.locator(formId);
      if (pathname === '/') assert.equal(await page.locator('.nav-actions a[href="australia-outdoor-kitchen-dealers/#dealer-pack"]').isVisible(), true);
      await page.locator('[data-consent="denied"]').click();
      await form.locator('[name="name"]').fill('Private Name');
      assert.equal(await events('form_start'), 0);
      await page.locator('#kaisteel-consent-settings').click();
      await page.locator('[data-consent="granted"]').click();
      await form.locator('[name="company"]').fill('Private Company');
      await form.locator('[name="email"]').fill('secret@example.invalid');
      assert.equal(await events('form_start'), 1);
      assert.equal(await form.locator('input:visible:not([type=checkbox]):not([aria-hidden=true]), select:visible, textarea:visible').count(), 4);
      assert.equal(await form.locator('[name="company"]').getAttribute('required'), null);
      assert.equal(await form.locator('input[required]:not([type=checkbox])').count(), 2);
      await form.locator('[name="notes"]').fill('Private Message');
      await form.locator('[name="email"]').fill('invalid-email');
      await form.locator('[name="consent"]').check();
      await form.locator('[type="submit"]').click();
      assert.equal(posts, 0, 'Invalid email must not submit');
      await form.locator('[name="email"]').fill('secret@example.invalid');
      await form.locator('[type="submit"]').click();
      await page.waitForFunction(sel => document.querySelector(sel).classList.contains('err'), statusId);
      assert.equal(await events('generate_lead'), 0);
      assert.equal(await form.locator('[name="name"]').inputValue(), 'Private Name');
      // Click intent is never a lead, and mail bodies/addresses never reach dataLayer.
      await page.locator('a[href^="mailto:"]').first().evaluate(e => {e.addEventListener('click', ev => ev.preventDefault()); e.click();});
      await page.locator('a[href^="https://wa.me/"]').first().evaluate(e => {e.addEventListener('click', ev => ev.preventDefault()); e.click();});
      assert.equal(await events('email_click'), 1); assert.equal(await events('whatsapp_click'), 1);
      assert.equal(await events('generate_lead'), 0);
      mode = 'hold';
      await form.evaluate(e => {e.requestSubmit(); e.requestSubmit();});
      await page.waitForFunction(sel => document.querySelector(sel + ' [type=submit]').disabled, formId);
      for (let i = 0; !held && i < 100; i++) await new Promise(r => setTimeout(r, 10));
      assert.ok(held); assert.equal(posts, 2, 'Only one in-flight retry');
      assert.equal(await events('generate_lead'), 0, 'No success before response');
      await held.fulfill({status: 200, contentType: 'application/json', body: '{}'});
      await page.waitForFunction(sel => document.querySelector(sel).classList.contains('ok'), statusId);
      assert.equal(await events('generate_lead'), 1); assert.equal(await events('dealer_inquiry_submit'), pathname === '/' ? 0 : 1);
      const commands = await page.evaluate(() => JSON.stringify(dataLayer));
      assert.doesNotMatch(commands, /Private Name|Private Company|secret@|Private Message|private-message|mailto:|wa\.me/);
      assert.match(commands, /au_dealer_pack/);
      assert.match(payload, /linkedin/);
      // New enquiry starts a new form funnel; one success remains one lead.
      await form.locator('[name="name"]').fill('Another Name');
      assert.equal(await events('form_start'), 2);
      assert.equal(await events('generate_lead'), 1);
      await form.locator('[name="email"]').fill('other@example.invalid');
      await form.locator('[name="consent"]').check();
      held = null;
      await form.locator('[type="submit"]').click();
      for (let i = 0; !held && i < 100; i++) await new Promise(r => setTimeout(r, 10));
      assert.ok(held);
      await held.fulfill({status: 200, contentType: 'application/json', body: '{}'});
      await page.waitForFunction(sel => document.querySelector(sel).classList.contains('ok'), statusId);
      assert.equal(await events('generate_lead'), 2, 'Name and email alone, with consent, succeed');
      assert.equal(await events('dealer_inquiry_submit'), pathname === '/' ? 0 : 2, 'Only explicit dealer-pack requests are dealer information enquiries');
      for (const width of [390, 1440]) {
        await page.setViewportSize({width, height: 900});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      if (pathname === '/') {
        await page.locator('#business a[href="australia-outdoor-kitchen-dealers/#dealer-pack"]').click();
        assert.equal(await page.locator('[name="utm_source"]').inputValue(), 'linkedin');
        assert.equal(await page.locator('[name="utm_campaign"]').inputValue(), 'au_dealer_pack');
      }
      await context.close();
      console.log('PASS', pathname, 'four fields, two required, validation, consent, attribution, privacy, clicks, failure and deduplicated success');
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
