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

The global homepage inquiry form is checked for normal success, blocked local/session storage, native validation and submission without JavaScript, offline failures, HTTP 500, and the actual 15-second timeout. Recovery checks cover retained fields/consent, clipboard success and denial, updated email drafts, and successful retry. Additional checks cover failed animation initialization and horizontal overflow at mobile and desktop widths.

These tests use mocked provider responses. They do not establish production delivery, mail-client behavior, or Formspree configuration. Without JavaScript, submission uses the browser's native POST and provider response page; the site's JavaScript timeout and recovery controls are unavailable.

## Global inquiry funnel regression

```sh
node tests/inquiry-funnel.cjs
```

This runner fulfills production-host URLs from the checkout and intercepts every external request. It never loads the real Google tag or submits to Formspree. It verifies homepage business email/country/buyer type/request type requirements (name/company/message optional), email validation, consent-gated starts, no click-to-lead conversion, privacy of custom event payloads, failure retention, success only after a response, concurrent-submit suppression, mobile/desktop overflow, and preserved first-touch UTM attribution. Actual GA4 ingestion/admin Enhanced Measurement settings and sales-mailbox delivery remain outside these mocked checks. See ACQUISITION-VERIFICATION.md for the release/reporting handoff.

## Global navigation, redirect and visual evidence

```sh
node tests/global-navigation.cjs
```

Serves every same-origin browser request directly from the checkout, aborts all external requests and non-GET requests. Checks old Australian campaign redirects to the global business section, legacy `#dealer-pack` to contact, query attribution retention, no-index/canonical metadata, removal of Australian landing-page entrances, keyboard navigation and consent, form access and horizontal overflow. Captures all root HTML pages at 390 px and 1440 px plus the global contact form under `/tmp/kaisteel-global-browser-qa` (override with `QA_ARTIFACTS`). Inspect screenshots manually before release; a passing automated run alone is not visual acceptance.

### Release acceptance gate

All three browser runners and manual desktop/mobile screenshot inspection must pass before production publishing. Syntax checks or static policy tests do not constitute browser acceptance. On 8 November 2026 the baseline command `node tests/inquiry-funnel.cjs` failed before any test ran: Chromium exited SIGABRT with `process_singleton_posix.cc:297 socket() failed: Operation not permitted (1)`. No real inquiry was sent. The updated tests require execution in an authorized environment with browser support; do not work around a browser launch restriction by changing security flags or permissions.

## Policy synchronization regression (offline)

```sh
python3 tests/policy-regression.py
```

Requires Python 3, pypdf and pdftotext. Checks policy boundaries, all local links and anchors, HTML JSON-LD, sitemap, retired-URL redirect and embedded PDF notice links. Compares homepage form fields, scripts, videos, privacy/website terms, technical PDFs and QC PDF against the approved base commit. The Australian form is intentionally retired. Required homepage inputs, consent and submission code may not change. This static test does not replace the browser runners or visual responsive QA.

## 12 November WEB-P1 implementation update
The homepage legacy form is now retired in favor of the two product-selection enquiry forms. `python3 tests/p1-static.py` validates the current P1 field schema and logo master-path fidelity; policy-regression.py now checks the authorized new enquiry routes instead of freezing the old homepage form markup. On 13 November 2026, `tests/inquiry-funnel.cjs`, `tests/inquiry-resilience.cjs`, and `tests/global-navigation.cjs` were migrated to the P1 product-selection forms and updated video layout, and all static and browser checks passed with mocked external services. Tests must mock all external services; verify success/failure, double-click, no-JS, keyboard, mobile and fallback flows before release.
