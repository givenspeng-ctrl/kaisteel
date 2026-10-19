# Inquiry resilience checks

Run from the repository root with Node.js, Python 3, Playwright, and Chromium available:

```sh
node tests/inquiry-resilience.cjs
```

The cloud environment already provides Playwright and `/usr/bin/chromium`. Elsewhere, install Playwright outside the checkout and select your browser executable:

```sh
npm install --prefix /tmp/kaisteel-test-deps playwright
NODE_PATH=/tmp/kaisteel-test-deps/node_modules CHROMIUM_PATH=/path/to/chromium node tests/inquiry-resilience.cjs
```

The runner starts and stops a local Python server on port 8127. It intercepts every external browser request, including native form POSTs with JavaScript disabled. No inquiry reaches Formspree, analytics, or other external services. Use an unused port 8127.

Both inquiry forms are checked for normal success, blocked local/session storage, native validation and submission without JavaScript, offline failures, HTTP 500, and the actual 15-second timeout. Recovery checks cover retained fields/consent, clipboard success and denial, updated email drafts, and successful retry. Additional checks cover failed animation initialization and horizontal overflow at mobile and desktop widths.

These tests use mocked provider responses. They do not establish production delivery, mail-client behavior, or Formspree configuration. Without JavaScript, submission uses the browser's native POST and provider response page; the site's JavaScript timeout and recovery controls are unavailable.

## Australia funnel regression

```sh
node tests/inquiry-funnel.cjs
```

This runner fulfills production-host URLs from the checkout and intercepts every external request. It never loads the real Google tag or submits to Formspree. It verifies five initial fields, keyboard disclosure, hidden optional-field validation, consent-gated starts, no click-to-lead conversion, privacy of custom event payloads, failure retention, success only after a response, concurrent-submit suppression, mobile/desktop overflow, and first-touch UTM preservation from homepage to Australia. Actual GA4 ingestion/admin Enhanced Measurement settings and sales-mailbox delivery remain outside these mocked checks. See ACQUISITION-VERIFICATION.md for the release/reporting handoff.
