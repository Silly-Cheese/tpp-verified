import { db, COLLECTIONS, api, normalizeDocumentId } from './firebase.js';

const form = document.getElementById('verifyForm');
const input = document.getElementById('documentId');
const modal = document.getElementById('verifyModal');
const closeBtn = document.getElementById('closeVerifyModal');
const card = document.getElementById('resultCard');
const title = document.getElementById('verifyModalTitle');
const modalCard = document.querySelector('#verifyModal .modal-card');

function clean(value) { return String(value || 'Not listed').replace(/[<>]/g, ''); }
function isExpired(record) { const until = record.validUntil || record.expiresAt || ''; if (!until) return false; const end = new Date(until); return !Number.isNaN(end.getTime()) && end < new Date(); }

function statusInfo(record) {
  const raw = String(record.status || 'Active').trim();
  const normalized = raw.toLowerCase();
  if (normalized === 'active' && isExpired(record)) return { type: 'neutral', icon: '!', title: 'Document Expired', label: 'Expired', message: 'This document exists, but it is past its active verification period.' };
  if (normalized === 'active') return { type: 'valid', icon: '✓', title: 'Valid Volunteer Confirmation', label: 'Active', message: 'This document is listed as active in the official records of The Prayer Project.' };
  if (normalized === 'expired') return { type: 'neutral', icon: '!', title: 'Document Expired', label: 'Expired', message: 'This document exists, but it is past its active verification period.' };
  if (normalized === 'superseded') return { type: 'neutral', icon: '↺', title: 'Document Superseded', label: 'Superseded', message: 'This document exists, but a newer confirmation may have replaced it.' };
  if (normalized === 'archived') return { type: 'neutral', icon: '!', title: 'Document Archived', label: 'Archived', message: 'This document is archived and is no longer active for public verification.' };
  if (normalized === 'suspended' || normalized === 'under review') return { type: 'neutral', icon: '!', title: 'Document Under Review', label: raw, message: 'This document exists, but The Prayer Project is reviewing its current verification status.' };
  if (normalized === 'revoked' || normalized === 'invalid') return { type: 'invalid', icon: '✕', title: 'Document Not Active', label: normalized === 'invalid' ? 'Revoked' : raw, message: 'This document exists, but it is no longer active for public verification.' };
  return { type: 'neutral', icon: '!', title: 'Verification Needs Review', label: raw || 'Needs Review', message: 'This document exists, but its current status requires confirmation from The Prayer Project.' };
}

function setStatus(type, icon) {
  modalCard.classList.remove('status-valid', 'status-invalid', 'status-neutral');
  modalCard.classList.add('status-' + type);
  const existing = document.querySelector('.status-corner');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.className = 'status-corner ' + (type === 'valid' ? 'valid' : type === 'invalid' ? 'invalid' : 'neutral');
  badge.textContent = icon;
  modalCard.appendChild(badge);
}

function openModal() { modal.hidden = false; modal.style.display = 'grid'; }
function closeModal() { modal.hidden = true; modal.style.display = 'none'; }
closeModal();
closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

function showNotFound(id) {
  setStatus('invalid', '✕');
  title.textContent = 'Document Not Found';
  card.className = 'result-card invalid-card';
  card.innerHTML = '<h3>Document Not Found</h3><p>No verification record exists for <strong>' + clean(id) + '</strong>.</p><p>Please check the Document ID exactly as printed on the form or contact <strong>pray@ask4prayers.com</strong>.</p>';
  openModal();
}

function publicResult(record) {
  const info = statusInfo(record);
  const active = info.type === 'valid';
  setStatus(info.type, info.icon);
  title.textContent = info.title;
  card.className = active ? 'result-card valid-card' : info.type === 'invalid' ? 'result-card invalid-card' : 'result-card';
  const publicMessage = record.publicStatusMessage || info.message;
  card.innerHTML = '<h3>' + clean(info.title) + '</h3>' +
    '<p>' + clean(publicMessage) + '</p>' +
    '<div class="v2-status-ribbon ' + (active ? 'valid' : info.type === 'invalid' ? 'invalid' : 'warning') + '">' + clean(info.label) + '</div>' +
    '<div class="result-grid">' +
      '<strong>Document ID</strong><span>' + clean(record.documentId) + '</span>' +
      '<strong>Volunteer Name</strong><span>' + clean(record.volunteerName) + '</span>' +
      '<strong>Position / Role</strong><span>' + clean(record.positionRole || 'Volunteer') + '</span>' +
      '<strong>Service Dates</strong><span>' + clean(record.startDate) + ' through ' + clean(record.endDate) + '</span>' +
      '<strong>Valid From</strong><span>' + clean(record.validFrom || record.startDate) + '</span>' +
      '<strong>Valid Until</strong><span>' + clean(record.validUntil || record.endDate || 'No expiration listed') + '</span>' +
      '<strong>Total Verified Hours</strong><span>' + clean(record.totalHours) + '</span>' +
      '<strong>Issued On</strong><span>' + clean(record.issuedOn) + '</span>' +
      '<strong>Verified By</strong><span>' + clean(record.verifiedBy || 'The Prayer Project') + '</span>' +
      '<strong>Status</strong><span>' + clean(info.label) + '</span>' +
    '</div>' +
    '<div class="v2-public-note"><strong>Privacy notice:</strong> Public verification only confirms document status and essential service information. Internal disciplinary or administrative notes are not displayed publicly.</div>';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = normalizeDocumentId(input.value);
  setStatus('neutral', '…');
  title.textContent = 'Checking Records';
  card.className = 'result-card';
  card.innerHTML = '<h3>Checking official records...</h3><p>Please wait while the verification system searches for this Document ID.</p>';
  openModal();
  try {
    const snap = await api.getDoc(api.doc(db, COLLECTIONS.confirmations, id));
    if (!snap.exists()) { showNotFound(id); return; }
    publicResult(snap.data());
  } catch (err) {
    console.error(err);
    setStatus('invalid', '!');
    title.textContent = 'Verification Error';
    card.className = 'result-card invalid-card';
    card.innerHTML = '<h3>Verification Error</h3><p>The verification system could not complete the lookup. Please try again later or contact <strong>pray@ask4prayers.com</strong>.</p>';
  }
});