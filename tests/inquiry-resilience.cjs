// Requires Playwright and Chromium. All external requests are intercepted.
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:8127';
const endpointHost = 'formspree.io';
const routes = [
  {path: '/', form: '#rfq-form', status: '#rfq-status', button: '#rfq-submit'},
  {path: '/australia-outdoor-kitchen-dealers/', form: '#dealer-form', status: '#dealer-status', button: '#dealer-submit'}
];
async function fill(page, target, noJavaScript) {
  const form = page.locator(target.form);
  for (const [name, value] of Object.entries({name: 'Sprint test', company: 'Test company', email: 'audit@example.invalid'})) {
    await form.locator(`[name="${name}"]`).fill(value);
  }
  if (target.path === '/') {
    await form.locator('[name="destination"]').fill('United States');
    await form.locator('[name="buyerType"]').selectOption({label: 'Dealer'});
  } else {
    await form.locator('[name="destination"]').selectOption({label: 'Victoria'});
    await form.locator('[name="buyerType"]').selectOption({label: 'Outdoor-living dealer'});
  }
  await form.locator('[name="notes"]').fill('Retain this enquiry');
  await form.locator('[name="consent"]').check({force: noJavaScript});
}
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8127', '--bind', '127.0.0.1', '--directory', root], {stdio: 'ignore'});
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      let tries = 0;
      const poll = async () => {
        try { await fetch(origin); resolve(); }
        catch (error) { if (++tries > 40) reject(error); else setTimeout(poll, 50); }
      };
      poll();
    });
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
    for (const target of routes) {
      for (const scenario of ['normal', 'blocked-storage', 'no-javascript', 'offline', 'http-error', 'timeout']) {
        const context = await browser.newContext({viewport: {width: 390, height: 844}, javaScriptEnabled: scenario !== 'no-javascript'});
        let mode = scenario;
        let posts = 0;
        let captured = '';
        const errors = [];
        await context.route('**/*', async route => {
          const request = route.request();
          const hostname = new URL(request.url()).hostname;
          if (hostname === endpointHost) {
            posts++; captured = request.postData() || '';
            if (mode === 'offline') return route.abort('internetdisconnected');
            if (mode === 'timeout') return; // Withhold the response until the application's real timer fires.
            return route.fulfill({status: mode === 'http-error' ? 500 : 200, contentType: 'application/json', body: '{}'});
          }
          if (hostname !== '127.0.0.1') return route.abort();
          return route.continue();
        });
        if (scenario === 'blocked-storage') await context.addInitScript(() => {
          for (const name of ['sessionStorage', 'localStorage']) {
            Object.defineProperty(window, name, {get() {throw new DOMException('Blocked storage', 'SecurityError');}});
          }
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(origin + target.path + '?utm_source=sprint-test');
          if (scenario !== 'no-javascript') await page.locator('[data-consent="denied"]').click();
          if (target.path === '/') {
            if (scenario === 'no-javascript') assert.equal(await page.locator('#models').evaluate(e => getComputedStyle(e).opacity), '1');
            else {
              await page.locator('#models').scrollIntoViewIfNeeded();
              await page.waitForFunction(() => getComputedStyle(document.querySelector('#models')).opacity === '1');
            }
          }
          await page.locator(target.button).click({force: scenario === 'no-javascript'});
          assert.equal(posts, 0, 'Empty forms must not submit');
          await fill(page, target, scenario === 'no-javascript');
          if (scenario === 'offline') {
            await context.setOffline(true);
            assert.equal(await page.evaluate(() => navigator.onLine), false);
          }
          await page.locator(target.button).click({force: scenario === 'no-javascript'});
          if (['normal', 'blocked-storage'].includes(scenario)) {
            await page.waitForFunction(sel => document.querySelector(sel).classList.contains('ok'), target.status);
            assert.equal(await page.locator(target.form + ' [name="company"]').inputValue(), '');
            assert.match(captured, /sprint-test/);
            assert.equal(posts, 1);
          } else if (scenario === 'no-javascript') {
            await page.waitForURL('https://formspree.io/**');
            assert.equal(posts, 1);
            assert.match(captured, /Test(?:\+|%20)company/);
          } else {
            await page.waitForFunction(sel => document.querySelector(sel).classList.contains('err'), target.status, {timeout: 20000});
            assert.equal(await page.locator(target.form + ' [name="company"]').inputValue(), 'Test company');
            assert.equal(await page.locator(target.form + ' [name="consent"]').isChecked(), true);
            assert.equal(await page.locator(target.button).isDisabled(), false);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Recovery controls must fit mobile width');
            if (scenario === 'timeout') assert.match(await page.locator(target.status).textContent(), /timed out/);
            const email = page.locator(target.status + ' a');
            assert.match(await email.getAttribute('href'), /^mailto:sales@kaisteelkitchen.com/);
            await page.locator(target.form + ' [name="company"]').fill('Edited company');
            await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => {throw new Error('Denied');}}}));
            await page.getByRole('button', {name: 'Copy enquiry', exact: true}).click();
            assert.match(await page.getByRole('textbox', {name: 'Enquiry text to copy'}).inputValue(), /Edited company/);
            await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => {window.copiedEnquiry = text;}}}));
            await page.getByRole('button', {name: 'Copy enquiry', exact: true}).click();
            assert.match(await page.evaluate(() => window.copiedEnquiry), /Retain this enquiry/);
            await email.evaluate(e => {e.addEventListener('click', ev => ev.preventDefault()); e.click();});
            assert.match(decodeURIComponent(await email.getAttribute('href')), /Edited company/);
            await context.setOffline(false); mode = 'normal';
            await page.getByRole('button', {name: 'Retry submission', exact: true}).click();
            await page.waitForFunction(sel => document.querySelector(sel).classList.contains('ok'), target.status);
          }
          assert.deepEqual(errors, []);
          console.log('PASS', target.path, scenario);
        } finally { await context.close(); }
      }
    }
    // Verify progressive reveals remain animated after removing the pending class.
    {
      const context = await browser.newContext();
      await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      const page = await context.newPage();
      await page.goto(origin);
      assert.ok(await page.locator('.reveal.pending').count());
      await page.locator('#models').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#models').classList.contains('in'));
      assert.match(await page.locator('#models').evaluate(e => getComputedStyle(e).transitionDuration), /0\.7s/);
      await context.close();
      console.log('PASS progressive animation');
    }
    // Missing animation APIs must not hide content or stop inquiry initialization.
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
      for (const target of routes) {
        await page.goto(origin + target.path);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    }
    await context.close();
    console.log('PASS animation failure and mobile/desktop overflow checks');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
