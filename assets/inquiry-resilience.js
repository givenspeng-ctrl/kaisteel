(function () {
  'use strict';
  var memory = Object.create(null);
  var storage = {
    get: function (key) {
      try { var value = window.sessionStorage.getItem(key); if (value !== null) return value; } catch (_error) {}
      return memory[key] || null;
    },
    set: function (key, value) {
      memory[key] = value;
      try { window.sessionStorage.setItem(key, value); } catch (_error) {}
    }
  };
  async function request(endpoint, data) {
    var controller = new AbortController();
    var timer;
    var timeout = new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        var error = new Error('Request timed out');
        error.name = 'TimeoutError';
        reject(error);
        controller.abort();
      }, 15000);
    });
    try {
      var response = await Promise.race([
        fetch(endpoint, {method: 'POST', body: data, headers: {Accept: 'application/json'}, signal: controller.signal}),
        timeout
      ]);
      if (!response.ok) throw new Error('HTTP ' + response.status);
    } finally { clearTimeout(timer); }
  }
  function errorMessage(error) {
    return (error.name === 'TimeoutError' ? 'The request timed out. Delivery could not be confirmed.' :
      'Online submission failed. Delivery could not be confirmed.') +
      ' Your details are still here. Retry, copy them, or send an email. If you retry, please mention any duplicate enquiry.';
  }
  function recover(status, form, compose, message) {
    status.className = (status.id === 'rfq-status' ? 'rfq-status' : 'status') + ' err';
    status.replaceChildren();
    var notice = document.createElement('p');
    notice.textContent = message;
    var actions = document.createElement('div');
    actions.className = 'btns';
    var retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'btn dark'; retry.textContent = 'Retry submission';
    retry.addEventListener('click', function () { form.requestSubmit(); });
    var copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'btn dark'; copy.textContent = 'Copy enquiry';
    var email = document.createElement('a');
    email.className = 'btn dark'; email.textContent = 'Email enquiry';
    function refreshEmail() {
      var draft = compose(new FormData(form));
      email.href = 'mailto:sales@kaisteelkitchen.com?subject=' + draft.subject + '&body=' + draft.body;
    }
    refreshEmail();
    // Regenerate from current fields, including any edits made after a failed request.
    email.addEventListener('click', refreshEmail);
    var feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    copy.addEventListener('click', async function () {
      var draft = compose(new FormData(form));
      var text = decodeURIComponent(draft.subject) + '\n\n' + decodeURIComponent(draft.body);
      try {
        await navigator.clipboard.writeText(text);
        feedback.textContent = 'Enquiry copied. Paste it into an email to sales@kaisteelkitchen.com and send it.';
      } catch (_error) {
        feedback.textContent = 'Clipboard access is unavailable. Select and copy the enquiry below.';
        var textarea = status.querySelector('[data-enquiry-copy]');
        if (!textarea) {
          textarea = document.createElement('textarea');
          textarea.setAttribute('data-enquiry-copy', '');
          textarea.setAttribute('aria-label', 'Enquiry text to copy');
          textarea.rows = 8;
          textarea.readOnly = true;
          status.appendChild(textarea);
        }
        textarea.value = text; textarea.focus(); textarea.select();
      }
    });
    actions.append(retry, copy, email);
    status.append(notice, actions, feedback);
  }
  window.KAISTEELInquiry = {storage: storage, request: request, recover: recover, errorMessage: errorMessage};
}());
