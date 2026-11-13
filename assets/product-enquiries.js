(function(){'use strict';
var ATTRIBUTION_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
// First-touch attribution saved by the homepage (session only); falls back to this page's URL.
function attribution(){var out={},saved=null,query;try{saved=JSON.parse(window.sessionStorage.getItem('kaisteel_attribution')||'null');}catch(_error){saved=null;}
try{query=new URLSearchParams(window.location.search);}catch(_error){query=null;}
ATTRIBUTION_KEYS.forEach(function(key){var value=saved&&typeof saved[key]==='string'?saved[key]:'';if(!value&&query)value=query.get(key)||'';if(value)out[key]=String(value).slice(0,200);});
out.page_path=window.location.pathname;return out;}
function withAttribution(form){var data=new FormData(form),extra=attribution();Object.keys(extra).forEach(function(key){if(extra[key]&&!data.has(key))data.append(key,extra[key]);});return data;}
document.querySelectorAll('.product-enquiry').forEach(function(form){var busy=false;var button=form.querySelector('[type=submit]'),status=form.querySelector('.status'),label=button.textContent;
// Mail/copy fallback text uses only the visible form fields (no consent flag or attribution internals).
function compose(data){var parts=[];data.forEach(function(v,k){if(k!=='consent'&&k!=='page_path'&&ATTRIBUTION_KEYS.indexOf(k)===-1)parts.push(k+': '+v);});return {subject:encodeURIComponent('KAISTEEL '+data.get('request_type')),body:encodeURIComponent(parts.join('\n'))};}
form.addEventListener('submit',async function(event){event.preventDefault();if(busy||!form.reportValidity())return;busy=true;button.disabled=true;button.textContent='Sending…';status.textContent='';
try{const data=withAttribution(form);await window.KAISTEELInquiry.request(form.action,data);
if(typeof window.gtag==='function'){window.gtag('event',form.id==='dealer-form'?'dealer_pack_submit':'rfq_submit');}
status.className='status';status.textContent=label==='Request Dealer Pack'?'Your Dealer Pack request has been received by the form service. This is not an order confirmation.':'Your enquiry has been received by the form service for review. This is not an order confirmation.';form.reset();}
catch(error){window.KAISTEELInquiry.recover(status,form,compose,window.KAISTEELInquiry.errorMessage(error));}
finally{busy=false;button.disabled=false;button.textContent=label;}});});}());
