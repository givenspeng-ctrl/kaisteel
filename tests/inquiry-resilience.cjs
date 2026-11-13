// Requires Playwright and Chrome/Chromium. All external requests are intercepted; Formspree is mocked.
// Covers both P1 product-selection forms: success, blocked storage, no-JS native POST, offline,
// HTTP 500 and the real 15 s timeout, with retry, clipboard (success + denied) and mailto recovery.
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:8127';
const endpointHost = 'formspree.io';
const product = '/pro-vs-max-outdoor-kitchen.html';
const targets = [
  {section: '#dealer-pack', label: 'Request Dealer Pack', success: /Dealer Pack request has been received/},
  {section: '#quotation', label: 'Request a Quotation', success: /enquiry has been received by the form service/}
];
const results = [];
async function check(name, fn) {
  try {await fn(); results.push(['PASS', name]); console.log('PASS', name);}
  catch (error) {results.push(['FAIL', name, error.message.split('\n')[0]]); console.log('FAIL', name, '::', error.message.split('\n')[0]);}
}
async function fill(form, target, noJavaScript) {
  for (const [name, value] of Object.entries({name: 'Sprint test', company: 'Test company', email: 'audit@example.invalid', country: 'Testland'})) {
    await form.locator(`[name="${name}"]`).fill(value);
  }
  if (target.section === '#quotation') {
    await form.locator('[name="model"]').selectOption('CUSTOM');
    await form.locator('[name="supply_scope"]').selectOption('Full Package');
    await form.locator('[name="project_notes"]').fill('Retain this enquiry');
  } else {
    await form.locator('[name="business_type"]').selectOption('Dealer / Distributor');
  }
  await form.locator('[name="consent"]').check({force: noJavaScript});
}
(async () => {
  const server = spawn(process.env.PYTHON_PATH || 'python3', ['-m', 'http.server', '8127', '--bind', '127.0.0.1', '--directory', root], {stdio: 'ignore'});
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      let tries = 0;
      const poll = async () => {
        try { await new Promise((ready, failed) => {require('node:http').get(origin, response => {response.resume(); response.on('end', ready);}).on('error', failed);}); resolve(); }
        catch (error) { if (++tries > 40) reject(error); else setTimeout(poll, 50); }
      };
      poll();
    });
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox']});
    for (const target of targets) {
      for (const scenario of ['normal', 'blocked-storage', 'no-javascript', 'offline', 'http-error', 'timeout']) {
        const name = `${target.section} ${scenario}`;
        const context = await browser.newContext({viewport: {width: 390, height: 844}, javaScriptEnabled: scenario !== 'no-javascript'});
        let mode = scenario, posts = 0, captured = '';
        const errors = [], external = [];
        await context.route('**/*', async route => {
          const request = route.request();
          const hostname = new URL(request.url()).hostname;
          if (hostname === endpointHost) {
            posts++; captured = request.postData() || '';
            if (mode === 'offline') return route.abort('internetdisconnected');
            if (mode === 'timeout') return; // Withhold the response until the application's real 15 s timer fires.
            return route.fulfill({status: mode === 'http-error' ? 500 : 200, contentType: 'application/json', body: '{}'});
          }
          if (hostname !== '127.0.0.1') {external.push(hostname); return route.abort();}
          return route.continue();
        });
        if (scenario === 'blocked-storage') await context.addInitScript(() => {
          for (const name of ['sessionStorage', 'localStorage']) {
            Object.defineProperty(window, name, {get() {throw new DOMException('Blocked storage', 'SecurityError');}});
          }
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await check(name, async () => {
          await page.goto(origin + product + '?utm_source=sprint-test' + target.section);
          const form = page.locator(target.section + ' form.product-enquiry');
          const button = form.locator('[type=submit]');
          const status = form.locator('.status');
          if (scenario !== 'no-javascript') await page.locator('[data-consent="denied"]').click();
          else {
            assert.match(await page.locator(target.section + ' form').innerText(), /Submission opens the form provider.s response page[\s\S]*sales@kaisteelkitchen\.com/, '<noscript> fallback not visible');
          }
          await button.click({force: scenario === 'no-javascript'});
          assert.equal(posts, 0, 'Empty forms must not submit');
          await fill(form, target, scenario === 'no-javascript');
          if (scenario === 'offline') {
            await context.setOffline(true);
            assert.equal(await page.evaluate(() => navigator.onLine), false);
          }
          const started = Date.now();
          await button.click({force: scenario === 'no-javascript'});
          if (['normal', 'blocked-storage'].includes(scenario)) {
            await page.waitForFunction(([sel, re]) => new RegExp(re).test(document.querySelector(sel + ' form .status').textContent), [target.section, target.success.source]);
            assert.equal(await form.locator('[name="company"]').inputValue(), '');
            assert.equal(posts, 1);
            assert.match(captured, /name="request_type"\r\n\r\n(Request Dealer Pack|Request a Quotation)/);
            assert.match(captured, /name="utm_source"\r\n\r\nsprint-test/);
            assert.match(captured, /name="page_path"\r\n\r\n\/pro-vs-max-outdoor-kitchen\.html/);
            if (target.section === '#quotation') {assert.match(captured, /name="model"\r\n\r\nCUSTOM/); assert.match(captured, /name="supply_scope"\r\n\r\nFull Package/);}
          } else if (scenario === 'no-javascript') {
            await page.waitForURL('https://formspree.io/**');
            assert.equal(posts, 1);
            assert.match(captured, /company=Test(?:\+|%20)company/);
            assert.match(captured, /request_type=Request/);
            if (target.section === '#quotation') assert.match(captured, /model=CUSTOM/);
          } else {
            await page.waitForFunction(sel => document.querySelector(sel + ' form .status').classList.contains('err'), target.section, {timeout: 20000});
            if (scenario === 'timeout') {
              const elapsed = Date.now() - started;
              assert.ok(elapsed >= 14500, 'timeout fired early: ' + elapsed);
              assert.match(await status.textContent(), /timed out/);
              console.log('  timeout fired after', elapsed, 'ms');
            } else assert.match(await status.textContent(), /Online submission failed/);
            assert.equal(await form.locator('[name="company"]').inputValue(), 'Test company');
            assert.equal(await form.locator('[name="consent"]').isChecked(), true);
            assert.equal(await button.isDisabled(), false);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Recovery controls must fit mobile width');
            const email = status.locator('a');
            assert.match(await email.getAttribute('href'), /^mailto:sales@kaisteelkitchen.com/);
            await form.locator('[name="company"]').fill('Edited company');
            await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => {throw new Error('Denied');}}}));
            await status.getByRole('button', {name: 'Copy enquiry', exact: true}).click();
            assert.match(await status.getByRole('textbox', {name: 'Enquiry text to copy'}).inputValue(), /Edited company/);
            assert.match(await status.innerText(), /Clipboard access is unavailable/);
            await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => {window.copiedEnquiry = text;}}}));
            await status.getByRole('button', {name: 'Copy enquiry', exact: true}).click();
            const copied = await page.evaluate(() => window.copiedEnquiry);
            assert.match(copied, /Edited company/);
            assert.doesNotMatch(copied, /consent/);
            assert.doesNotMatch(copied, /utm_|page_path|sprint-test/, 'copy/mail text must not carry attribution internals');
            assert.doesNotMatch(decodeURIComponent(await email.getAttribute('href')), /utm_|page_path/);
            if (target.section === '#quotation') assert.match(copied, /model: CUSTOM[\s\S]*supply_scope: Full Package[\s\S]*project_notes: Retain this enquiry/);
            assert.match(await status.innerText(), /Enquiry copied/);
            await email.evaluate(e => {e.addEventListener('click', ev => ev.preventDefault()); e.click();});
            assert.match(decodeURIComponent(await email.getAttribute('href')), /Edited company/);
            await context.setOffline(false); mode = 'normal';
            await status.getByRole('button', {name: 'Retry submission', exact: true}).click();
            await page.waitForFunction(([sel, re]) => new RegExp(re).test(document.querySelector(sel + ' form .status').textContent), [target.section, target.success.source]);
            assert.match(captured, /Edited company/);
            assert.match(captured, /name="utm_source"\r\n\r\nsprint-test/, 'retry keeps attribution');
          }
          assert.deepEqual(errors, []);
          assert.ok(!external.includes(endpointHost));
        });
        await context.close();
      }
      // Double-click: a second click while pending must not create a second POST.
      await check(`${target.section} double-click prevention`, async () => {
        const context = await browser.newContext({viewport: {width: 390, height: 844}});
        let posts = 0, held = null;
        await context.route('**/*', route => {
          const hostname = new URL(route.request().url()).hostname;
          if (hostname === endpointHost) {posts++; held = route; return;}
          return hostname === '127.0.0.1' ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        await page.goto(origin + product);
        await page.locator('[data-consent="denied"]').click();
        const form = page.locator(target.section + ' form.product-enquiry');
        await fill(form, target, false);
        await form.locator('[type=submit]').dblclick();
        await page.waitForFunction(sel => document.querySelector(sel + ' form [type=submit]').disabled, target.section);
        await new Promise(r => setTimeout(r, 300));
        assert.equal(posts, 1);
        await held.fulfill({status: 200, contentType: 'application/json', body: '{}'});
        await page.waitForFunction(sel => !document.querySelector(sel + ' form [type=submit]').disabled, target.section);
        assert.equal(posts, 1);
        await context.close();
      });
    }
    // Verify progressive reveals remain animated after removing the pending class.
    await check('progressive animation on /', async () => {
      const context = await browser.newContext();
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(origin);
      assert.ok(await page.locator('.reveal.pending').count());
      await page.locator('#models').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#models').classList.contains('in'));
      assert.match(await page.locator('#models').evaluate(e => getComputedStyle(e).transitionDuration), /0\.7s/);
      await context.close();
    });
    // Missing animation APIs must not hide content or stop inquiry initialization.
    await check('animation failure fallback and mobile/desktop overflow', async () => {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}});
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await context.addInitScript(() => {window.IntersectionObserver = undefined;});
      const page = await context.newPage();
      await page.goto(origin);
      assert.equal(await page.locator('#models').evaluate(e => getComputedStyle(e).opacity), '1');
      assert.equal(await page.locator('#contact').evaluate(e => getComputedStyle(e).opacity), '1');
      assert.equal(await page.locator('.reveal.pending').count(), 0);
      for (const width of [390, 1440]) {
        await page.setViewportSize({width, height: 844});
        for (const p of ['/', product]) {
          await page.goto(origin + p);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, p + ' ' + width);
        }
      }
      await page.goto(origin + product);
      assert.equal(await page.evaluate(() => typeof window.KAISTEELInquiry.request), 'function');
      await context.close();
    });
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\nSUMMARY inquiry-resilience: ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log('  FAIL', f[1], '::', f[2]);
  if (failed.length) process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
