import { db, COLLECTIONS, api, VERIFY_URL } from './firebase.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const requestedId = params.get('id');

installPublicEnhancements();
installContactRequest();
installResultObserver();

document.addEventListener('DOMContentLoaded', () => {
  if (requestedId && $('documentId') && $('verifyForm')) {
    $('documentId').value = requestedId;
    setTimeout(() => $('verifyForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), 350);
  }
});

function installPublicEnhancements() {
  const about = document.getElementById('about');
  if (!about || document.getElementById('v3TrustPanel')) return;
  about.insertAdjacentHTML('afterend', `
    <section class="info-grid" id="v3TrustPanel">
      <article><h3>Official Verification Seal</h3><p>This lookup confirms whether a record was issued through The Prayer Project verification system.</p></article>
      <article><h3>Tamper Warning</h3><p>If the printed document does not match this verification page, treat the document as unverified and contact The Prayer Project.</p></article>
      <article><h3>Verification Hash</h3><p>Each result can display a short verification hash to make copied or altered documents easier to detect.</p></article>
    </section>
  `);
}

function installContactRequest() {
  const footer = document.querySelector('footer');
  if (!footer || document.getElementById('v3ContactRequest')) return;
  footer.insertAdjacentHTML('beforebegin', `
    <section class="hero" id="v3ContactRequest">
      <p class="overline">Verification Help</p>
      <h2>Submit a Verification Question</h2>
      <p class="hero-copy">Use this if a document looks incorrect, does not match the printed form, or needs additional confirmation.</p>
      <form id="verificationRequestForm" class="verify-form">
        <input id="requestDocumentId" placeholder="Document ID" autocomplete="off">
        <input id="requestEmail" type="email" placeholder="Your Email" required>
        <input id="requestMessage" placeholder="Question or concern" required>
        <button type="submit">Send Request</button>
      </form>
      <p class="security-note" id="verificationRequestNotice"></p>
    </section>
  `);
  document.getElementById('verificationRequestForm')?.addEventListener('submit', submitVerificationRequest);
}

async function submitVerificationRequest(event) {
  event.preventDefault();
  const notice = $('verificationRequestNotice');
  try {
    await api.setDoc(api.doc(db, 'verificationRequests', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), {
      documentId: clean($('requestDocumentId')?.value || $('documentId')?.value || ''),
      requesterEmail: clean($('requestEmail')?.value || ''),
      message: clean($('requestMessage')?.value || ''),
      status: 'open',
      createdAt: api.serverTimestamp(),
      updatedAt: api.serverTimestamp()
    });
    notice.textContent = 'Verification request sent. The Prayer Project can review it internally.';
    notice.style.color = 'var(--green)';
    event.target.reset();
  } catch (error) {
    notice.textContent = 'Request could not be sent. Please email pray@ask4prayers.com.';
    notice.style.color = 'var(--red)';
  }
}

function installResultObserver() {
  const card = $('resultCard');
  if (!card) return;
  const observer = new MutationObserver(() => enrichResultCard(card));
  observer.observe(card, { childList: true, subtree: true });
}

function enrichResultCard(card) {
  if (!card.innerHTML || card.querySelector('.v3-result-seal')) return;
  const text = card.textContent || '';
  const match = text.match(/TPP[-A-Z0-9]+/i);
  const id = match ? match[0].toUpperCase() : ($('documentId')?.value || '').toUpperCase();
  if (!id) return;
  const link = `${VERIFY_URL || 'https://verify.ask4prayers.com'}?id=${encodeURIComponent(id)}`;
  const hash = checksum(id + text.slice(0, 80));
  card.insertAdjacentHTML('beforeend', `
    <div class="v2-public-note v3-result-seal">
      <strong>Official Verification Seal:</strong> This result was checked through The Prayer Project verification system.<br>
      <strong>Tamper Warning:</strong> If the printed document does not match this page, treat the document as unverified.<br>
      <strong>Verification Hash:</strong> TPP-HASH: ${hash}<br>
      <strong>Direct Link:</strong> ${clean(link)}
    </div>
  `);
}

function checksum(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16).toUpperCase().slice(0, 4) + '-' + Math.abs(hash * 31).toString(16).toUpperCase().slice(0, 4);
}
function clean(value = '') { return String(value).replace(/[<>]/g, '').trim(); }
