(function () {
  'use strict';

  var measurementId = 'G-CWBQM9Z095';
  var storageKey = 'kaisteel_analytics_consent';
  var analyticsActive = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    if (analyticsActive) window.dataLayer.push(arguments);
  };

  function loadAnalytics() {
    if (analyticsActive) return;
    window['ga-disable-' + measurementId] = false;
    analyticsActive = true;
    var script = document.createElement('script');
    script.id = 'kaisteel-ga4-script';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { anonymize_ip: true });
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
        '<a href="privacy-policy.html">Privacy Policy</a>' +
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

  function init() {
    addStyles();
    var choice = readChoice();
    if (choice === 'granted') loadAnalytics();
    if (choice === 'granted' || choice === 'denied') showSettingsButton();
    else showPanel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
