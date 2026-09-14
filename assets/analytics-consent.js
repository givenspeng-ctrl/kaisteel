(function () {
  'use strict';

  var measurementId = 'G-CWBQM9Z095';
  var storageKey = 'kaisteel_analytics_consent';
  var analyticsActive = false;
  var controls = new URLSearchParams(window.location.search);
  var internal = controls.get('ks_internal') === '1';
  var debug = controls.get('ks_debug') === '1';
  try {
    if (controls.has('ks_internal')) localStorage.setItem('kaisteel_internal', internal ? '1' : '0');
    internal = localStorage.getItem('kaisteel_internal') === '1';
  } catch (_error) {}
  var production = /^(www\.)?kaisteelkitchen\.com$/.test(window.location.hostname);
  var excluded = !production || (internal && !debug);
  window['ga-disable-' + measurementId] = excluded;

  window.dataLayer = window.dataLayer || [];
  function queueCommand() { window.dataLayer.push(arguments); }
  function emit(name, params) {
    if (!analyticsActive) return;
    queueCommand('event', name, Object.assign({transport_type: 'beacon'}, params || {}));
  }
  window.gtag = function () {
    // Shared click tracking replaces legacy inline listeners without double counting.
    if (arguments[0] === 'event') {
      var name = arguments[1];
      if (['email_click','whatsapp_click','trade_guide_download','document_download'].indexOf(name) !== -1) return;
      if (name === 'rfq_submit' || name === 'dealer_pack_submit') {
        emit('generate_lead', {form_id: name === 'rfq_submit' ? 'rfq-form' : 'dealer-form', method: 'contact_form'});
        return;
      }
    }
    if (analyticsActive) window.dataLayer.push(arguments);
  };

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest && event.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var url;
    try { url = new URL(href, window.location.href); } catch (_error) { return; }
    var label = (link.textContent || '').trim().slice(0,100);
    // Never send mail subjects/bodies or WhatsApp prefilled messages to Analytics.
    var params = {link_text: label, page_path: window.location.pathname};
    if (url.protocol === 'mailto:') emit('email_click', params);
    else if (/^(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)$/.test(url.hostname)) emit('whatsapp_click', params);
    else if (url.origin === window.location.origin && /\.pdf$/i.test(url.pathname)) {
      params.file_name = url.pathname.split('/').pop();
      emit(/PRO-MAX-B2B-Guide|catalog/i.test(params.file_name) ? 'download_catalog' : 'document_download', params);
    }
    if (/\b(rfq|request (?:a )?quote|configuration review)\b/i.test(label)) {
      emit('request_quote', {method: url.protocol === 'mailto:' ? 'email' : 'form_navigation', page_path: window.location.pathname});
    }
  });

  function loadAnalytics() {
    if (analyticsActive || excluded) return;
    window['ga-disable-' + measurementId] = false;
    analyticsActive = true;
    var script = document.createElement('script');
    script.id = 'kaisteel-ga4-script';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(script);
    window.gtag('js', new Date());
    var config = { anonymize_ip: true };
    if (internal || debug) config.traffic_type = 'internal';
    if (debug) config.debug_mode = true;
    window.gtag('config', measurementId, config);
  }

  function saveChoice(value) {
    try { localStorage.setItem(storageKey, value); } catch (_error) {}
  }

  function readChoice() {
    try { return localStorage.getItem(storageKey); } catch (_error) { return null; }
  }

  function removePanel() {
    var panel = document.getElementById('kaisteel-consent-panel');
    if (panel) panel.remove();
  }

  function showSettingsButton() {
    if (document.getElementById('kaisteel-consent-settings')) return;
    var button = document.createElement('button');
    button.id = 'kaisteel-consent-settings';
    button.type = 'button';
    button.textContent = 'Cookie settings';
    button.setAttribute('aria-label', 'Review analytics cookie settings');
    button.addEventListener('click', showPanel);
    document.body.appendChild(button);
  }

  function choose(value) {
    saveChoice(value);
    removePanel();
    if (value === 'granted') loadAnalytics();
    else disableAnalytics();
    showSettingsButton();
  }

  function disableAnalytics() {
    window['ga-disable-' + measurementId] = true;
    analyticsActive = false;
    var script = document.getElementById('kaisteel-ga4-script');
    if (script) script.remove();
    document.cookie.split(';').forEach(function (item) {
      var name = item.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
      }
    });
  }

  function showPanel() {
    removePanel();
    var panel = document.createElement('section');
    panel.id = 'kaisteel-consent-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'kaisteel-consent-title');
    panel.innerHTML =
      '<div class="kaisteel-consent-copy">' +
        '<strong id="kaisteel-consent-title">Analytics choice</strong>' +
        '<p>We use Google Analytics only with your permission to understand site use and improve our B2B content. Necessary session attribution remains available for RFQ processing.</p>' +
        '<a href="/privacy-policy.html">Privacy Policy</a>' +
      '</div>' +
      '<div class="kaisteel-consent-actions">' +
        '<button type="button" data-consent="denied">Reject analytics</button>' +
        '<button type="button" class="primary" data-consent="granted">Accept analytics</button>' +
      '</div>';
    panel.addEventListener('click', function (event) {
      var value = event.target && event.target.getAttribute('data-consent');
      if (value) choose(value);
    });
    document.body.appendChild(panel);
    var firstButton = panel.querySelector('button');
    if (firstButton) firstButton.focus();
  }

  function addStyles() {
    var style = document.createElement('style');
    style.textContent =
      '#kaisteel-consent-panel{position:fixed;z-index:99999;left:18px;right:18px;bottom:18px;max-width:980px;margin:auto;display:flex;gap:22px;align-items:center;justify-content:space-between;padding:18px 20px;background:#102331;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:12px;box-shadow:0 12px 38px rgba(0,0,0,.3);font:14px/1.5 Arial,sans-serif}' +
      '#kaisteel-consent-panel strong{font-size:16px}#kaisteel-consent-panel p{margin:5px 0;color:#d7e0e6}#kaisteel-consent-panel a{color:#e8bd68}' +
      '.kaisteel-consent-actions{display:flex;gap:9px;flex-shrink:0}.kaisteel-consent-actions button,#kaisteel-consent-settings{border:1px solid #c8d1d8;border-radius:7px;padding:9px 13px;background:#fff;color:#102331;cursor:pointer;font-weight:700}.kaisteel-consent-actions .primary{background:#c99535;border-color:#c99535;color:#071722}' +
      '#kaisteel-consent-settings{position:fixed;z-index:99998;right:12px;bottom:10px;padding:6px 9px;font-size:11px;opacity:.78}' +
      '@media(max-width:700px){#kaisteel-consent-panel{align-items:stretch;flex-direction:column;gap:12px}.kaisteel-consent-actions{display:grid;grid-template-columns:1fr 1fr}.kaisteel-consent-actions button{padding:11px 8px}}';
    document.head.appendChild(style);
  }

  function ensureLegalFooterLinks() {
    var footer = document.querySelector('footer .wrap') || document.querySelector('footer');
    if (!footer || footer.querySelector('[data-kaisteel-commercial-terms],a[href$="commercial-terms.html"]')) return;
    var links = document.createElement('span');
    links.setAttribute('data-kaisteel-commercial-terms', 'true');
    links.innerHTML = '<a href="/privacy-policy.html">Privacy Policy</a> · <a href="/terms.html">Website Terms</a> · <a href="/commercial-terms.html">Commercial Terms</a>';
    footer.appendChild(links);
  }

  function init() {
    addStyles();
    ensureLegalFooterLinks();
    var choice = readChoice();
    if (choice === 'granted') loadAnalytics();
    if (choice === 'granted' || choice === 'denied') showSettingsButton();
    else showPanel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
