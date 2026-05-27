import { db, COLLECTIONS, api, normalizeDocumentId } from './firebase.js';

const form = document.getElementById('verifyForm');
const input = document.getElementById('documentId');
const wrap = document.getElementById('resultWrap');
const card = document.getElementById('resultCard');

function clean(value) {
  return String(value || 'Not listed').replace(/[<>]/g, '');
}

function showNotFound(id) {
  card.className = 'result-card invalid-card';
  card.innerHTML = '<h3>Document Not Found</h3><p>No verification record exists for <strong>' + clean(id) + '</strong>.</p><p>Please check the Document ID exactly as printed on the form or contact <strong>pray@ask4prayers.com</strong>.</p>';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = normalizeDocumentId(input.value);
  wrap.hidden = false;
  card.className = 'result-card';
  card.innerHTML = '<h3>Checking official records...</h3><p>Please wait while the verification system searches for this Document ID.</p>';

  try {
    const snap = await api.getDoc(api.doc(db, COLLECTIONS.confirmations, id));
    if (!snap.exists()) {
      showNotFound(id);
      return;
    }

    const d = snap.data();
    const active = (d.status || 'Active') === 'Active';
    card.className = active ? 'result-card valid-card' : 'result-card invalid-card';
    card.innerHTML = '<h3>' + (active ? 'Valid Volunteer Confirmation' : 'Document Marked Invalid') + '</h3><p>' + (active ? 'This document is listed in the official records of The Prayer Project.' : 'This document exists, but it has been marked invalid or inactive by an administrator.') + '</p><div class="result-grid"><strong>Document ID</strong><span>' + clean(d.documentId) + '</span><strong>Volunteer Name</strong><span>' + clean(d.volunteerName) + '</span><strong>Age</strong><span>' + clean(d.age) + '</span><strong>Position / Role</strong><span>' + clean(d.positionRole) + '</span><strong>Duties</strong><span>' + clean(d.duties) + '</span><strong>Service Dates</strong><span>' + clean(d.startDate) + ' through ' + clean(d.endDate) + '</span><strong>Total Verified Hours</strong><span>' + clean(d.totalHours) + '</span><strong>Issued On</strong><span>' + clean(d.issuedOn) + '</span><strong>Verified By</strong><span>' + clean(d.verifiedBy) + '</span><strong>Status</strong><span>' + clean(d.status || 'Active') + '</span></div>';
  } catch (err) {
    console.error(err);
    card.className = 'result-card invalid-card';
    card.innerHTML = '<h3>Verification Error</h3><p>The verification system could not complete the lookup. This usually means Firestore rules are blocking public reads for volunteerConfirmations.</p>';
  }
});
