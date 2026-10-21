# Australia inquiry funnel — review and launch notes

## Evidence and limits (2026-10-19)

- Work started from clean `d685862` (latest fetched `origin/main`), containing PR #1 and PR #2. No repository AGENTS.md or applicable software-engineering SKILL.md was available, including `.agents/skills`; deployment instructions and tests/README.md were read.
- Existing `assets/analytics-consent.js` uses `G-CWBQM9Z095`, with opt-in analytics, internal/non-production exclusion, successful `generate_lead` and dealer-only `dealer_inquiry_submit`, plus email/WhatsApp click events. The supplied GA4 property is `552898746`; the stream-to-property mapping and admin settings still need verification. An aggregate event email does not establish the absence of tracking or show inquiry counts by source.
- PR #1's body explicitly says external requests were intercepted and real Formspree receipt was not verified. Its discussion has no additional receipt evidence. No live form was submitted in this task. Form action remains `https://formspree.io/f/xwlkoeel`.
- The live homepage and Australian page were readable via the web reader and still showed the previous form/CTA content during this work. Direct environment HTTP/API requests returned Forbidden; GitHub connector reads succeeded. The GSC Wizard GA4 event report request for October 1–16 was refused with `payment_required` / `subscription_required`. No subscription, credential or permission was added. Production GA4 event counts, sources, property configuration and actual email delivery remain unverified.
- The October 19–December 31 Metricool schedule is empty according to the parent conversation's independent check. The repository week-one social file has no publication markers; it was preserved as-is. This document supplies future draft links only. No posts or schedules were changed.

## Changes and measurement contract

Both forms show name, company, business email, market and business type, plus the existing privacy consent. All prior technical fields remain in a native optional disclosure, usable without JavaScript. Invalid optional URL fields reopen the disclosure with JavaScript. The 15-second timeout, retained input, retry, copy and email recovery remain intact. In-flight repeat submits are ignored. Success means the provider returned HTTP success, not that the sales mailbox received or read the message.

The homepage navigation, hero sample CTA, dealer section and partner CTA now use the existing Australian page. Other market content and global commercial terms remain available and unchanged. Internal resource-to-form links retain intent but no longer introduce acquisition UTMs.

| Event | Meaning | Counting |
| --- | --- | --- |
| `form_start` | First field focus after analytics consent | Once per form per page visit; resets after success |
| `generate_lead` | Form endpoint HTTP success | Once per accepted browser submission, never a click |
| `dealer_inquiry_submit` | Subset of success with a fixed dealer/retailer/distributor type | Do not add to generate_lead totals |
| `email_click`, `whatsapp_click`, `dealer_whatsapp_click` | Contact intent | Not inquiries or confirmed conversations |

No contact-field values, free-text market, notes, email/WhatsApp URLs or message bodies are sent by the custom inquiry events. Analytics page URLs exclude fragments and unreviewed query parameters; referrers are reduced to origin. Reviewed campaign tokens below are retained for GA attribution. Unknown campaign tokens are deliberately omitted from GA URLs; original first-touch UTMs remain available to the private form-processing flow. Expand the reviewed token list when approving future campaigns. Opt-out visitors and blocked analytics will undercount; form/provider records remain the delivery source of truth. Browser-side deduplication cannot reconcile an accepted request whose response was lost; timeout notices already explain uncertain delivery and possible duplicates.

## Future unpublished Australia links

Use only on future approved drafts; this is not a publishing instruction. Destination: `/australia-outdoor-kitchen-dealers/#dealer-pack`. Use lowercase tokens:

- `utm_source`: `linkedin`, `facebook`, or `instagram` (actual publishing platform)
- `utm_medium`: `organic_social`
- `utm_campaign`: `au_dealer_pack`
- `utm_content`: `week1_production_fitout`, `week1_structural_fabrication`, or `week1_appliance_ready`
- No personal data in UTMs. No UTMs on internal navigation.

Example future LinkedIn production-fitout CTA:

Request Australian dealer information and discuss sample options:
https://kaisteelkitchen.com/australia-outdoor-kitchen-dealers/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=au_dealer_pack&utm_content=week1_production_fitout#dealer-pack

Use the same destination and campaign for the other two draft topics, changing only platform and content token. No automated price, certification, margin or delivery promise is added.

## Launch and reporting handoff

This change is a draft PR only. Do not merge or deploy without the parent conversation's confirmation. Exact release action after review: mark the draft ready, merge the reviewed PR into `main` through existing repository rules, and allow `.github/workflows/pages.yml` to run. Approve `github-pages` only through existing environment protection if requested; do not change domain, credentials, permissions or bypass protections. Confirm successful run and live HTML/JS afterward. Branch pushes do not deploy under the current workflow.

Before relying on production reporting, the property owner should verify measurement ID mapping, disable GA4 Enhanced Measurement **form interactions** (to avoid competing automatic form_start/form_submit), and inspect outbound-click/site-search measurement so automatic events cannot collect mail bodies, query data or duplicate custom clicks. These are server-side tag settings not inspectable from this checkout. Verify sanitized page_location and only the intended events in DebugView using consent and `?ks_internal=1&ks_debug=1`; return to `?ks_internal=0` afterward. Never mark form_submit or click events as successful inquiry conversions. Use generate_lead as the overall inquiry key event and dealer_inquiry_submit as a subset.

Requested recurring report should show date range and session source/medium + campaign, Australian landing-page sessions, form starts, generate_lead, dealer subset, and contact clicks separately. Register event-scoped form_id / lead_type if needed. Historical `rfq_start` / `dealer_pack_start` should be compared separately to the new consistent event. GA admin/report access and scheduled report changes are not completed here.

If real delivery testing becomes necessary, seek separate confirmation for exactly one POST to `https://formspree.io/f/xwlkoeel` using name `KAISTEEL delivery check`, company `KAISTEEL internal QA`, email `qa@example.invalid`, market `Australia`, business type `Other`, and optional notes `INTERNAL SYNTHETIC DELIVERY TEST — do not treat as a sales lead; no response requested.` Confirm the mailbox owner can inspect provider acceptance and actual inbox arrival. Exclude analytics with `ks_internal=1`; do not submit until approved. No such POST has been made.

## Local validation outcome

- `node tests/inquiry-resilience.cjs`: all 12 form/scenario combinations and both animation/layout groups passed. Test health polling uses Node HTTP instead of fetch to avoid the installed Node 24 Undici parser assertion. Native no-JavaScript disclosure uses the same forced-click convention as the existing runner.
- `node tests/inquiry-funnel.cjs`: both form routes passed, including minimum five-field submission, dealer versus other classification, repeated enquiry reset, duplicate in-flight requests, mobile primary CTA visibility, keyboard and privacy assertions.
- `node --check` passed for both shared JavaScript files; `git diff --check` passed. Original field-name sets and Formspree action match; commercial-terms.html has no diff.
- Screenshots inspected at desktop and mobile widths. All browser test external requests were intercepted; successful mock responses do not prove real email arrival or GA4 ingestion.


## 21 October 2026 release
Both forms now contain only name, email, company and message; only name and email plus the consent checkbox are required. Country, role and all technical inputs have been removed. Attribution metadata and submission recovery remain. A successful generic homepage form produces generate_lead with lead_type general_enquiry. A successful explicit Australian dealer-pack request additionally produces dealer_inquiry_submit with lead_type dealer_information_request. This is a received information request, not proof of a qualified dealer. Qualified dealer counts require sales verification and deduplication; WhatsApp clicks remain intent only.
