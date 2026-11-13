// P1 enquiry funnel: consent gate, analytics privacy, attribution, payload schema and deduplicated success.
// No network: production URLs are fulfilled from the checkout; Formspree and every other external host are mocked or aborted.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const base = 'https://kaisteelkitchen.com';
const product = '/pro-vs-max-outdoor-kitchen.html';
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.pdf':'application/pdf'};
const forms = [
  {section: '#dealer-pack', id: 'dealer-form', dealer: 1, label: 'Request Dealer Pack', visible: 5, requestType: 'Request Dealer Pack', success: /Dealer Pack request has been received/},
  {section: '#quotation', id: 'rfq-form', dealer: 0, label: 'Request a Quotation', visible: 12, requestType: 'Request a Quotation', success: /enquiry has been received by the form service/}
];
const results = [];
async function check(name, fn) {
  try {await fn(); results.push(['PASS', name]); console.log('PASS', name);}
  catch (error) {results.push(['FAIL', name, error.message.split('\n')[0]]); console.log('FAIL', name, '::', error.message.split('\n')[0]);}
}
function fields(body) {
  const out = {};
  for (const m of body.matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g)) out[m[1]] = m[2];
  if (!Object.keys(out).length) for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const external = [];
  try {
    // Homepage: no form, product-page routes only.
    {
      const context = await browser.newContext({viewport: {width: 390, height: 844}});
      let homePayload = '';
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'formspree.io') {homePayload = route.request().postData() || ''; return route.fulfill({status: 200, contentType: 'application/json', body: '{}'});}
        if (url.origin !== base) {external.push(url.hostname); return route.abort();}
        const filename = path.join(root, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
        try {return await route.fulfill({body: await fs.readFile(filename), contentType: mime[path.extname(filename)] || 'application/octet-stream'});} catch {return route.fulfill({status: 404, body: 'Not found'});}
      });
      const page = await context.newPage();
      await page.goto(base + '/');
      await check('/ has no <form> and no legacy #rfq-form', async () => {
        assert.equal(await page.locator('form').count(), 0);
        assert.equal(await page.locator('#rfq-form, #dealer-form').count(), 0);
      });
      await page.locator('[data-consent="denied"]').click();
      for (const target of ['#dealer-pack', '#quotation']) {
        await check(`/ #contact CTA routes to ${product}${target}`, async () => {
          await page.goto(base + '/#contact');
          await page.locator(`#contact a.btn[href="pro-vs-max-outdoor-kitchen.html${target}"]`).click();
          await page.waitForURL(base + product + target);
          // Smooth scrolling settles after navigation; the target section must end up at the top of the viewport.
          await page.waitForFunction(sel => {const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= -2 && r.top < 120;}, target, {timeout: 5000});
          assert.equal(await page.locator(target + ' form.product-enquiry').count(), 1);
        });
      }
      await check('first-touch session UTM from / reaches product-form POST (no UTM on product URL)', async () => {
        // Fresh session: attribution is first-touch per browser session, so the earlier direct visit must not count.
        await page.evaluate(() => sessionStorage.clear());
        await page.goto(base + '/?utm_source=facebook&utm_medium=organic_social&utm_campaign=au_dealer_pack');
        await page.locator('#contact a.btn[href="pro-vs-max-outdoor-kitchen.html#dealer-pack"]').click();
        await page.waitForURL(base + product + '#dealer-pack');
        const form = page.locator('#dealer-form');
        await form.locator('[name="email"]').fill('first-touch@example.invalid');
        await form.locator('[name="consent"]').check();
        await form.locator('[type="submit"]').click();
        await page.waitForFunction(() => /received by the form service/.test(document.querySelector('#dealer-form .status').textContent));
        const body = fields(homePayload);
        assert.equal(body.utm_source, 'facebook'); assert.equal(body.utm_campaign, 'au_dealer_pack');
        assert.equal(body.page_path, product);
        assert.equal(body.utm_term, undefined, 'empty attribution keys must not be appended');
      });
      await context.close();
    }
    for (const target of forms) {
      const context = await browser.newContext({viewport: {width: 390, height: 844}});
      let posts = 0, mode = 'error', held = null, payload = '';
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'formspree.io') {
          posts++; payload = route.request().postData() || '';
          if (mode === 'hold') {held = route; return;}
          return route.fulfill({status: 500, contentType: 'application/json', body: '{}'});
        }
        if (url.origin !== base) {external.push(url.hostname); return route.abort();}
        const filename = path.join(root, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
        try {return await route.fulfill({body: await fs.readFile(filename), contentType: mime[path.extname(filename)] || 'application/octet-stream'});} catch {return route.fulfill({status: 404, body: 'Not found'});}
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const events = name => page.evaluate(n => (window.dataLayer || []).filter(x => x[0] === 'event' && x[1] === n).length, name);
      await page.goto(base + product + '?utm_source=linkedin&utm_medium=organic_social&utm_campaign=au_dealer_pack&utm_content=week1_production_fitout&email=secret@example.invalid#private-message');
      const form = page.locator(target.section + ' form.product-enquiry');
      const submit = form.locator('[type="submit"]');
      const status = form.locator('.status');
      const T = s => `${target.section} ${s}`;
      await check(T('no Australian landing-page entrances'), async () => assert.equal(await page.locator('a[href*="australia-outdoor-kitchen-dealers"]').count(), 0));
      await page.locator('[data-consent="denied"]').click();
      await form.locator('[name="name"]').fill('Private Name');
      await check(T('consent denied -> form_start 0'), async () => assert.equal(await events('form_start'), 0));
      await page.locator('#kaisteel-consent-settings').click();
      await page.locator('[data-consent="granted"]').click();
      await form.locator('[name="company"]').fill('Private Company');
      await form.locator('[name="email"]').fill('secret@example.invalid');
      await check(T('consent granted -> form_start fires once'), async () => assert.equal(await events('form_start'), 1));
      await check(T('visible fields and required schema'), async () => {
        assert.equal(await form.locator('input:visible:not([type=checkbox]):not([type=hidden]), select:visible, textarea:visible').count(), target.visible);
        assert.equal(await form.locator('[name="company"]').getAttribute('required'), null);
        assert.equal(await form.locator('input[required]:not([type=checkbox])').count(), 1, 'only email required');
        assert.equal(await form.locator('[name="consent"]').getAttribute('required'), '');
        assert.equal(await form.locator('[name="request_type"]').inputValue(), target.requestType);
      });
      if (target.section === '#quotation') {
        await form.locator('[name="project_notes"]').fill('Private Message');
        await check(T('model/supply_scope default to "Help me choose"'), async () => {
          assert.equal(await form.locator('[name="model"]').inputValue(), 'Help me choose');
          assert.equal(await form.locator('[name="supply_scope"]').inputValue(), 'Help me choose');
        });
      }
      await form.locator('[name="email"]').fill('invalid-email');
      await form.locator('[name="consent"]').check();
      await submit.click();
      await check(T('invalid email does not submit'), async () => assert.equal(posts, 0));
      await form.locator('[name="email"]').fill('secret@example.invalid');
      await form.locator('[name="consent"]').uncheck();
      await submit.click();
      await check(T('missing consent does not submit'), async () => assert.equal(posts, 0));
      await form.locator('[name="consent"]').check();
      await submit.click();
      await page.waitForFunction(sel => document.querySelector(sel + ' form .status').classList.contains('err'), target.section);
      await check(T('HTTP 500 -> error state, generate_lead 0, input + consent retained'), async () => {
        assert.equal(posts, 1);
        assert.equal(await events('generate_lead'), 0);
        assert.equal(await form.locator('[name="name"]').inputValue(), 'Private Name');
        assert.equal(await form.locator('[name="company"]').inputValue(), 'Private Company');
        assert.equal(await form.locator('[name="consent"]').isChecked(), true);
        assert.equal(await submit.isDisabled(), false);
      });
      await check(T('mailto backup click is intent only (email_click 1, generate_lead 0)'), async () => {
        const email = status.locator('a[href^="mailto:"]');
        assert.match(await email.getAttribute('href'), /^mailto:sales@kaisteelkitchen\.com\?/);
        await email.evaluate(e => {e.addEventListener('click', ev => ev.preventDefault()); e.click();});
        assert.equal(await events('email_click'), 1);
        assert.equal(await events('generate_lead'), 0);
      });
      if (target.section === '#quotation') {
        await form.locator('[name="model"]').selectOption('CUSTOM');
        await form.locator('[name="supply_scope"]').selectOption('Appliance-Ready');
      }
      mode = 'hold'; held = null;
      await form.evaluate(e => {e.requestSubmit(); e.requestSubmit();});
      await check(T('double submit -> button disabled while pending, one in-flight POST'), async () => {
        await page.waitForFunction(sel => document.querySelector(sel + ' form [type=submit]').disabled, target.section);
        for (let i = 0; !held && i < 200; i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(held, 'request not held');
        await new Promise(r => setTimeout(r, 200));
        assert.equal(posts, 2, 'Only one in-flight retry');
        assert.equal(await submit.textContent(), 'Sending…');
        assert.equal(await events('generate_lead'), 0, 'No success before response');
      });
      if (held) await held.fulfill({status: 200, contentType: 'application/json', body: '{}'});
      await page.waitForFunction(([sel, re]) => new RegExp(re).test(document.querySelector(sel + ' form .status').textContent), [target.section, target.success.source]);
      const body = fields(payload);
      await check(T('POST body contains request_type' + (target.section === '#quotation' ? ', model=CUSTOM, supply_scope' : '')), async () => {
        assert.equal(body.request_type, target.requestType);
        assert.equal(body.email, 'secret@example.invalid');
        assert.equal(body.consent, 'on');
        if (target.section === '#quotation') {assert.equal(body.model, 'CUSTOM'); assert.equal(body.supply_scope, 'Appliance-Ready');}
      });
      await check(T('no auto-calculated price/amount in POST body'), async () => {
        for (const [k, v] of Object.entries(body)) assert.doesNotMatch(k + '=' + v, /price|amount|total|cost|usd|aud|nzd|\$|€|£/i, k);
      });
      await check(T('success -> generate_lead 1 with form_id, dealer_inquiry_submit ' + target.dealer), async () => {
        assert.equal(await events('generate_lead'), 1);
        assert.equal(await events('dealer_inquiry_submit'), target.dealer);
        const lead = await page.evaluate(() => window.dataLayer.find(x => x[0] === 'event' && x[1] === 'generate_lead')[2]);
        assert.equal(lead.form_id, target.id);
        assert.equal(lead.lead_type, target.dealer ? 'dealer_information_request' : 'general_enquiry');
        assert.equal(lead.page_path, product);
      });
      await check(T('success resets form, button re-enabled'), async () => {
        assert.equal(await form.locator('[name="company"]').inputValue(), '');
        assert.equal(await submit.isDisabled(), false);
        assert.equal(await submit.textContent(), target.label);
      });
      await check(T('dataLayer contains no PII, mailto or URL fragment'), async () => {
        const commands = await page.evaluate(() => JSON.stringify(window.dataLayer));
        assert.doesNotMatch(commands, /Private Name|Private Company|secret@|Private Message|private-message|mailto:|wa\.me/);
      });
      await check(T('reviewed UTM campaign reaches analytics config'), async () => assert.match(await page.evaluate(() => JSON.stringify(window.dataLayer)), /au_dealer_pack/));
      await check(T('UTM attribution + page_path present in Formspree POST body'), async () => {
        assert.equal(body.utm_source, 'linkedin'); assert.equal(body.utm_medium, 'organic_social');
        assert.equal(body.utm_campaign, 'au_dealer_pack'); assert.equal(body.utm_content, 'week1_production_fitout');
        assert.equal(body.page_path, product);
        assert.equal(body.utm_term, undefined);
      });
      // A new enquiry starts a new funnel; one success remains one lead.
      await form.locator('[name="name"]').fill('Another Name');
      await check(T('new enquiry -> form_start 2, generate_lead still 1'), async () => {
        assert.equal(await events('form_start'), 2);
        assert.equal(await events('generate_lead'), 1);
      });
      await form.locator('[name="email"]').fill('other@example.invalid');
      await form.locator('[name="consent"]').check();
      held = null;
      await submit.click();
      for (let i = 0; !held && i < 200; i++) await new Promise(r => setTimeout(r, 10));
      if (held) await held.fulfill({status: 200, contentType: 'application/json', body: '{}'});
      await page.waitForFunction(([sel, re]) => new RegExp(re).test(document.querySelector(sel + ' form .status').textContent), [target.section, target.success.source]);
      await check(T('second success -> generate_lead 2'), async () => {
        assert.equal(posts, 3);
        assert.equal(await events('generate_lead'), 2);
        assert.equal(await events('dealer_inquiry_submit'), 2 * target.dealer);
        assert.equal(fields(payload).name, 'Another Name');
      });
      await check(T('no horizontal overflow at 390/1440'), async () => {
        for (const width of [390, 1440]) {
          await page.setViewportSize({width, height: 900});
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, String(width));
        }
      });
      await check(T('no page errors'), async () => assert.deepEqual(errors, []));
      await context.close();
    }
    await check('all non-site requests intercepted (no live network)', async () => console.log('  intercepted external hosts:', [...new Set(external)].join(', ') || 'none'));
  } finally {await browser.close();}
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\nSUMMARY inquiry-funnel: ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log('  FAIL', f[1], '::', f[2]);
  if (failed.length) process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
