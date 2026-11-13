// All page requests, including same-origin files, are served by mocks. Never contact live providers.
// Covers legacy redirects, keyboard/consent/navigation, mobile menu, header logo, overflow on every public page,
// homepage video loading/aspect, P1 product-form keyboard access, old/new PDF URLs and QA screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const base = 'https://kaisteelkitchen.com';
const product = '/pro-vs-max-outdoor-kitchen.html';
const artifacts = process.env.QA_ARTIFACTS || '/tmp/kaisteel-qa-screenshots';
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.pdf':'application/pdf'};
const results = [];
async function check(name, fn) {
  try {await fn(); results.push(['PASS', name]); console.log('PASS', name);}
  catch (error) {results.push(['FAIL', name, error.message.split('\n')[0]]); console.log('FAIL', name, '::', error.message.split('\n')[0]);}
}
const responses = new Map();
async function isolate(context) {
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== 'GET' || url.origin !== base) return route.abort();
    const filename = path.join(root, decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    try {const body = await fs.readFile(filename); responses.set(url.pathname, 200); return await route.fulfill({body, contentType: mime[path.extname(filename)] || 'application/octet-stream'});}
    catch {responses.set(url.pathname, 404); return route.fulfill({status: 404, body: 'Not found'});}
  });
}
async function keyboardReach(page, selector) {
  for (let i = 0; i < 260; i++) {
    if (await page.locator(selector).evaluateAll(es => es.includes(document.activeElement))) return;
    await page.keyboard.press('Tab');
  }
  assert.fail('Not keyboard reachable: ' + selector);
}
// Screenshot helper: instant scrolling (test-only), trigger every reveal, wait for the 0.7 s transitions, return to top.
const settle = page => page.evaluate(async () => {
  document.documentElement.style.scrollBehavior = 'auto';
  for (let y = 0; y < document.body.scrollHeight; y += 500) {window.scrollTo({top: y, behavior: 'instant'}); await new Promise(r => setTimeout(r, 60));}
  await new Promise(r => setTimeout(r, 900));
  window.scrollTo({top: 0, behavior: 'instant'}); await new Promise(r => setTimeout(r, 200));
});
function get(url) {return new Promise((resolve, reject) => http.get(url, res => {const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks)}));}).on('error', reject));}
(async () => {
  await fs.mkdir(artifacts, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const server = spawn(process.env.PYTHON_PATH || 'python3', ['-m', 'http.server', '8128', '--bind', '127.0.0.1', '--directory', root], {stdio: 'ignore'});
  try {
    // Old campaigns must arrive on the global site without losing their attribution.
    for (const fragment of ['', '#dealer-pack', '#models']) {
      await check('legacy AU redirect ' + (fragment || '(no hash)') + ' keeps query', async () => {
        const context = await browser.newContext(); await isolate(context);
        const page = await context.newPage();
        const query = '?utm_source=linkedin&utm_medium=organic_social&utm_campaign=legacy_au&campaign_id=123';
        await page.goto(base + '/australia-outdoor-kitchen-dealers/' + query + fragment);
        const expected = fragment === '#dealer-pack' ? '#contact' : '#business';
        await page.waitForURL(base + '/' + query + expected);
        assert.equal(await page.locator('form, #dealer-form, #rfq-form').count(), 0);
        assert.ok(await page.locator('#contact a[href="pro-vs-max-outdoor-kitchen.html#dealer-pack"]').count());
        await context.close();
      });
    }
    await check('legacy AU source: noindex, canonical, no form', async () => {
      const source = await fs.readFile(path.join(root, 'australia-outdoor-kitchen-dealers/index.html'), 'utf8');
      assert.match(source, /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i);
      assert.match(source, /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/kaisteelkitchen\.com\/(?:#business)?["']/i);
      assert.doesNotMatch(source, /<form\b/i);
    });
    const pages = (await fs.readdir(root)).filter(p => p.endsWith('.html')).sort();
    for (const width of [390, 1440]) {
      const context = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 900}}); await isolate(context);
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base);
      await check(`[${width}] keyboard consent choice`, async () => {
        await keyboardReach(page, '[data-consent="denied"]');
        await page.keyboard.press('Enter');
        await page.locator('[data-consent="denied"]').waitFor({state: 'hidden'});
      });
      await settle(page);
      await page.screenshot({path: path.join(artifacts, `index-${width}.png`)});
      await page.screenshot({path: path.join(artifacts, `index-${width}-full.png`), fullPage: true});
      if (width === 390) {
        await check('[390] hamburger opens/closes; menu links work', async () => {
          const burger = page.locator('.hamburger');
          assert.equal(await page.locator('.navlinks').isVisible(), false);
          await keyboardReach(page, '.hamburger'); await page.keyboard.press('Enter');
          assert.equal(await burger.getAttribute('aria-expanded'), 'true');
          assert.equal(await page.locator('.navlinks').isVisible(), true);
          assert.equal(await burger.getAttribute('aria-label'), 'Close navigation menu');
          await page.screenshot({path: path.join(artifacts, 'mobile-menu-390.png')});
          const items = await page.locator('.navlinks a').evaluateAll(as => as.map(a => {const r = a.getBoundingClientRect(); return {h: a.getAttribute('href'), w: r.width, hgt: r.height, right: r.right};}));
          for (const it of items) {assert.ok(it.w > 0 && it.hgt >= 40, 'tap target ' + JSON.stringify(it)); assert.ok(it.right <= 390, 'menu item overflow ' + it.h);}
          await burger.click();
          assert.equal(await burger.getAttribute('aria-expanded'), 'false');
          assert.equal(await page.locator('.navlinks').isVisible(), false);
          await burger.click();
          await page.locator('.navlinks a[href="#manufacturing"]').click();
          await page.waitForURL(base + '/#manufacturing');
          await burger.click(); if (await burger.getAttribute('aria-expanded') === 'true') await burger.click();
        });
      }
      await check(`[${width}] keyboard nav link #models`, async () => {
        if (width === 390 && await page.locator('.hamburger').getAttribute('aria-expanded') !== 'true') {await page.locator('.hamburger').focus(); await page.keyboard.press('Enter');}
        await page.locator('nav .brand').focus();
        await keyboardReach(page, '.navlinks a[href="#models"]'); await page.keyboard.press('Enter');
        await page.waitForURL(base + '/#models');
      });
      await check(`[${width}] keyboard: home CTA -> ${product}#dealer-pack`, async () => {
        await page.locator('#contact').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#contact')).opacity === '1');
        await page.locator('#contact .eyebrow').evaluate(e => {e.tabIndex = -1; e.focus();});
        await keyboardReach(page, '#contact a.btn[href="pro-vs-max-outdoor-kitchen.html#dealer-pack"]');
        await page.keyboard.press('Enter');
        await page.waitForURL(base + product + '#dealer-pack');
      });
      for (const section of ['#dealer-pack', '#quotation']) {
        await check(`[${width}] keyboard-only ${section}: email + consent + submit`, async () => {
          await page.goto(base + product + section);
          await page.locator(section + ' h2').evaluate(e => {e.tabIndex = -1; e.focus();});
          const f = section + ' form.product-enquiry';
          await keyboardReach(page, f + ' [name=email]');
          await page.keyboard.type('keyboard@example.invalid');
          assert.equal(await page.locator(f + ' [name=email]').inputValue(), 'keyboard@example.invalid');
          await keyboardReach(page, f + ' [name=consent]');
          await page.keyboard.press('Space');
          assert.equal(await page.locator(f + ' [name=consent]').isChecked(), true);
          assert.equal(await page.locator(f + ' [name=consent]').getAttribute('required'), '');
          await keyboardReach(page, f + ' [type=submit]');
          assert.equal(await page.locator(f + ' [type=submit]').isVisible(), true);
          const outline = await page.locator(f + ' [type=submit]').evaluate(e => getComputedStyle(e).outlineStyle);
          assert.notEqual(outline, 'none', 'focus indicator missing');
        });
      }
      // P1 screenshots
      await page.goto(base + product); await settle(page);
      await page.screenshot({path: path.join(artifacts, `pro-vs-max-${width}.png`)});
      await page.screenshot({path: path.join(artifacts, `pro-vs-max-${width}-full.png`), fullPage: true});
      if (width === 390) {
        const a = await page.locator('#dealer-pack').boundingBox(), b = await page.locator('#quotation').boundingBox();
        await page.screenshot({path: path.join(artifacts, 'pro-vs-max-forms-390.png'), fullPage: true, clip: {x: 0, y: a.y - 10, width: 390, height: b.y + b.height - a.y + 20}});
      } else {
        const a = await page.locator('#dealer-pack').boundingBox(), b = await page.locator('#quotation').boundingBox();
        await page.screenshot({path: path.join(artifacts, 'pro-vs-max-forms-1440.png'), fullPage: true, clip: {x: 0, y: a.y - 10, width: 1440, height: b.y + b.height - a.y + 20}});
      }
      await check(`[${width}] ${product} nav links resolve`, async () => {
        for (const href of await page.locator('nav .navlinks a').evaluateAll(as => as.map(a => a.href))) {
          const u = new URL(href); if (u.origin !== base) continue;
          const file = path.join(root, u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname);
          await fs.access(file);
        }
      });
      // Every public page + the legacy AU URL.
      await fs.mkdir(path.join(artifacts, 'pages'), {recursive: true});
      for (const filename of [...pages, 'australia-outdoor-kitchen-dealers/']) {
        await check(`[${width}] ${filename}: no overflow, NoTagline logo >=200px visible with contrast`, async () => {
          await page.goto(base + '/' + filename);
          if (filename.startsWith('australia')) await page.waitForURL(base + '/#business');
          assert.equal(await page.locator('a[href*="australia-outdoor-kitchen-dealers"]').count(), 0, 'links to withdrawn AU landing page');
          await settle(page);
          const overflow = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: innerWidth}));
          assert.ok(overflow.sw <= overflow.iw, `overflow ${overflow.sw}>${overflow.iw}`);
          const logo = await page.locator('.brand img').first().evaluate(img => {
            const r = img.getBoundingClientRect();
            let el = img, bg = 'rgba(0, 0, 0, 0)';
            while (el && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {bg = getComputedStyle(el).backgroundColor; el = el.parentElement;}
            const st = getComputedStyle(img);
            return {src: img.getAttribute('src'), w: r.width, h: r.height, top: r.top, left: r.left, complete: img.complete, nw: img.naturalWidth, bg, vis: st.visibility, op: st.opacity, disp: st.display};
          });
          assert.match(logo.src, /NoTagline\.svg$/);
          assert.ok(logo.complete && logo.nw > 0, 'logo not loaded');
          assert.ok(logo.w >= 200, 'logo width ' + logo.w);
          assert.ok(logo.left >= 0 && logo.left + logo.w <= overflow.iw, 'logo clipped horizontally');
          assert.ok(logo.vis === 'visible' && logo.op === '1' && logo.disp !== 'none', 'logo hidden');
          const m = logo.bg.match(/[\d.]+/g).map(Number);
          const lum = m.slice(0, 3).map(c => {c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;});
          const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
          const ratio = /White/.test(logo.src) ? 1.05 / (L + 0.05) : (L + 0.05) / 0.05;
          assert.ok(ratio >= 3, `logo contrast ${ratio.toFixed(2)} on ${logo.bg}`);
          if (width === 1440 && filename === pages[0]) console.log('  logo sample', JSON.stringify(logo), 'contrast', ratio.toFixed(2));
          await page.screenshot({path: path.join(artifacts, 'pages', `${filename.replace(/\/$/, '').replace('.html', '')}-${width}.png`), fullPage: true});
        });
      }
      // Homepage video loading and geometry.
      await page.goto(base + '/'); await settle(page);
      const videos = await page.locator('video').evaluateAll(vs => vs.map(v => {
        const r = v.getBoundingClientRect(), st = getComputedStyle(v);
        return {poster: v.getAttribute('poster'), preload: v.getAttribute('preload'), src: v.querySelector('source')?.getAttribute('src'), w: r.width, h: r.height, fit: st.objectFit, transform: st.transform, caption: v.closest('figure')?.querySelector('figcaption strong')?.textContent, readyState: v.readyState, networkState: v.networkState};
      }));
      for (const [i, v] of videos.entries()) {
        await check(`[${width}] index video ${i + 1} (${v.src.split('/').pop()}): preload=none, poster 200, box/aspect`, async () => {
          assert.equal(v.preload, 'none');
          assert.ok(v.poster, 'poster missing');
          const nat = await page.evaluate(src => new Promise(res => {const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([0, 0]); im.src = src;}), v.poster);
          assert.equal(responses.get('/' + v.poster), 200, 'poster status');
          assert.ok(nat[0] > 0, 'poster did not decode');
          assert.ok(v.w > 0 && v.h > 0, 'zero box');
          const boxRatio = v.w / v.h, posterRatio = nat[0] / nat[1];
          const delta = Math.abs(boxRatio - posterRatio) / posterRatio;
          const crop = v.fit === 'cover' ? (1 - Math.min(boxRatio, posterRatio) / Math.max(boxRatio, posterRatio)) : 0;
          console.log(`  ${v.src.split('/').pop()} box ${v.w.toFixed(0)}x${v.h.toFixed(0)} (${boxRatio.toFixed(3)}) poster ${nat.join('x')} (${posterRatio.toFixed(3)}) fit=${v.fit} transform=${v.transform} crop=${(crop * 100).toFixed(0)}% caption="${v.caption}"`);
          assert.notEqual(v.fit, 'fill', 'object-fit:fill distorts');
          // Every video box must match its media ratio: no letterbox bars, no cover cropping, no scale hacks.
          assert.equal(v.transform, 'none', 'video transform ' + v.transform);
          await fs.access(path.join(root, v.src));
          assert.ok(delta < 0.03, v.fit === 'cover' ? `object-fit:cover crops ${(crop * 100).toFixed(0)}% of the frame (box ${boxRatio.toFixed(3)} vs media ${posterRatio.toFixed(3)})` : `box ${v.w.toFixed(0)}x${v.h.toFixed(0)} (${boxRatio.toFixed(3)}) letterboxes media ${posterRatio.toFixed(3)}`);
        });
      }
      await check(`[${width}] no video bytes downloaded before play (preload=none)`, async () => {
        for (const v of videos) assert.equal(responses.has('/' + v.src), false, v.src + ' fetched');
      });
      {
        const figs = page.locator('figure.evidence-video');
        const n = await figs.count();
        for (let i = 0; i < n; i++) {await figs.nth(i).scrollIntoViewIfNeeded(); await page.waitForTimeout(900); await figs.nth(i).screenshot({path: path.join(artifacts, `index-video-${i + 1}-${width}.png`)});}
      }
      await check(`[${width}] no page errors`, async () => assert.deepEqual(errors, []));
      await context.close();
    }
    // Desktop header: nav labels stay on one line, never overlap the 224 px logo or each other, no overflow.
    for (const width of [1181, 1280, 1440]) {
      await check(`[${width}] desktop nav single-line, no overlap with 224px logo, no overflow`, async () => {
        const context = await browser.newContext({viewport: {width, height: 900}}); await isolate(context);
        const page = await context.newPage(); await page.goto(base + '/');
        const r = await page.evaluate(() => {
          const R = e => e.getBoundingClientRect();
          const items = [{t: 'logo', r: R(document.querySelector('.brand img'))}, ...[...document.querySelectorAll('nav .navlinks a, nav .nav-actions a')].filter(a => getComputedStyle(a).display !== 'none').map(a => ({t: a.textContent, r: R(a), link: a.closest('.navlinks') !== null}))].sort((a, b) => a.r.left - b.r.left);
          const overlaps = []; for (let i = 1; i < items.length; i++) if (items[i].r.left < items[i - 1].r.right - 0.5) overlaps.push(items[i - 1].t + ' / ' + items[i].t);
          return {sw: document.documentElement.scrollWidth, iw: innerWidth, logo: items.find(i => i.t === 'logo').r.width, wrapped: items.filter(i => i.link && i.r.height > 24).map(i => i.t), overlaps};
        });
        assert.ok(r.sw <= r.iw, 'overflow'); assert.ok(r.logo >= 200, 'logo ' + r.logo);
        assert.deepEqual(r.wrapped, []); assert.deepEqual(r.overlaps, []);
        await page.screenshot({path: path.join(artifacts, `nav-${width}.png`), clip: {x: 0, y: 0, width, height: 90}});
        await context.close();
      });
    }
    // Old and new PDF URLs over a local HTTP server.
    const mapping = {
      'KAISTEEL-PRO-MAX-B2B-Guide.pdf': 'KAISTEEL-Procurement-Guide-2026-11.pdf',
      'KAISTEEL-Catalog-2026-Brand-v1.4.pdf': 'KAISTEEL-Procurement-Guide-2026-11.pdf',
      'KAISTEEL-Product-Guide-2026-10.pdf': 'KAISTEEL-Procurement-Guide-2026-11.pdf',
      'KAISTEEL-Manufacturing-Overview-2026-10.pdf': 'KAISTEEL-Manufacturing-Overview-2026-11.pdf',
      'KAISTEEL-MANUFACTURING-CAPABILITY-EN.pdf': 'KAISTEEL-Manufacturing-Overview-2026-11.pdf',
      'KAISTEEL-LIMITED-WARRANTY-V1.4.pdf': 'KAISTEEL-Limited-Warranty-2026-11.pdf',
      'KAISTEEL-Warranty-V1.3-Brand-v1.4.pdf': 'KAISTEEL-Limited-Warranty-2026-11.pdf',
      'KAISTEEL-Limited-Warranty-2026-10.pdf': 'KAISTEEL-Limited-Warranty-2026-11.pdf'};
    for (let i = 0; i < 40; i++) {try {await get('http://127.0.0.1:8128/'); break;} catch {await new Promise(r => setTimeout(r, 50));}}
    for (const [old, fresh] of Object.entries(mapping)) {
      await check(`old PDF /assets/${old} -> 200 and links to ${fresh}`, async () => {
        const r = await get('http://127.0.0.1:8128/assets/' + old);
        assert.equal(r.status, 200); assert.match(r.type, /pdf/);
        assert.ok(r.body.includes('https://kaisteelkitchen.com/assets/' + fresh), 'replacement URI not embedded');
      });
    }
    for (const fresh of [...new Set(Object.values(mapping)), 'KAISTEEL-Sample-Credit-Policy-2026-11.pdf']) {
      await check(`new PDF /assets/${fresh} -> 200`, async () => {const r = await get('http://127.0.0.1:8128/assets/' + fresh); assert.equal(r.status, 200); assert.match(r.type, /pdf/); assert.ok(r.body.length > 10000);});
    }
    console.log('Screenshots for mandatory visual review:', artifacts);
  } finally {await browser.close(); server.kill();}
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(`\nSUMMARY global-navigation: ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.log('  FAIL', f[1], '::', f[2]);
  if (failed.length) process.exitCode = 1;
})().catch(e => {console.error(e); process.exitCode = 1;});
