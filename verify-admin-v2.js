import { auth, db, COLLECTIONS, api, writeAuditLog, VERIFY_URL } from './firebase.js';

const $ = id => document.getElementById(id);
let cache = [];
let ready = false;

api.onAuthStateChanged(auth, async user => {
  if (!user) return;
  ready = true;
  setTimeout(renderV2Admin, 800);
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-v2-admin]');
  if (!button || !ready) return;
  const action = button.dataset.v2Admin;
  try {
    if (action === 'refresh') await renderV2Admin();
    if (action === 'copy-report') await copyReport();
    if (action === 'copy-link') await copyLink(button.dataset.id);
    if (action === 'status') await changeStatus(button.dataset.id, button.dataset.status);
  } catch (error) {
    alert(error?.message || 'V2 action failed.');
  }
});

async function renderV2Admin() {
  const adminContent = $('adminContent');
  if (!adminContent) return;
  cache = await loadRecords();
  let panel = $('v2VerifyAdmin');
  if (!panel) {
    adminContent.querySelector('.stats-row')?.insertAdjacentHTML('afterend', `<section class="v2-admin-panel" id="v2VerifyAdmin"><p class="overline">Verification Portal V2</p><h2>Document Trust Center</h2><p class="panel-note">Manage lifecycle status, privacy-safe public verification, quick reporting, and revocation workflows without exposing internal reasons publicly.</p><div class="v2-actions"><button class="primary" data-v2-admin="refresh">Refresh V2 Center</button><button data-v2-admin="copy-report">Copy Summary Report</button></div><div class="v2-admin-grid" id="v2Metrics"></div><div class="v2-record-list" id="v2Records"></div></section>`);
    panel = $('v2VerifyAdmin');
  }
  const metrics = calculateMetrics(cache);
  $('v2Metrics').innerHTML = `<article class="v2-admin-card"><strong>${metrics.active}</strong><span>Active</span></article><article class="v2-admin-card"><strong>${metrics.revoked}</strong><span>Revoked</span></article><article class="v2-admin-card"><strong>${metrics.expired}</strong><span>Expired</span></article><article class="v2-admin-card"><strong>${metrics.total}</strong><span>Total</span></article>`;
  $('v2Records').innerHTML = cache.slice(0, 12).map(recordCard).join('') || '<p class="panel-note">No verification records loaded.</p>';
}

async function loadRecords() {
  const rows = [];
  try {
    const snap = await api.getDocs(api.collection(db, COLLECTIONS.confirmations));
    snap.forEach(s => rows.push({ id: s.id, ...s.data() }));
  } catch (error) {
    console.warn('Could not load V2 records.', error);
  }
  return rows.sort((a, b) => String(b.issuedOn || '').localeCompare(String(a.issuedOn || '')));
}

function calculateMetrics(rows) {
  return {
    total: rows.length,
    active: rows.filter(x => normalized(x.status) === 'active').length,
    revoked: rows.filter(x => ['revoked', 'invalid'].includes(normalized(x.status))).length,
    expired: rows.filter(x => normalized(x.status) === 'expired').length
  };
}

function recordCard(d) {
  const status = normalized(d.status || 'Active');
  const css = status === 'active' ? '' : status === 'expired' ? 'expired' : 'revoked';
  const id = esc(d.documentId || d.id);
  return `<article class="v2-admin-record ${css}"><h4>${id}</h4><p><strong>${esc(d.volunteerName || 'Volunteer')}</strong> · ${esc(d.positionRole || 'Volunteer')}</p><div class="v2-meta"><span>Status: ${esc(d.status || 'Active')}</span><span>Hours: ${esc(d.totalHours || '0')}</span><span>Issued: ${esc(d.issuedOn || 'Not listed')}</span></div><div class="v2-copy-box">${esc(VERIFY_URL || 'https://verify.ask4prayers.com')}/?id=${encodeURIComponent(d.documentId || d.id)}</div><div class="v2-actions"><button data-v2-admin="copy-link" data-id="${id}">Copy Link</button><button data-v2-admin="status" data-id="${id}" data-status="Active" class="primary">Set Active</button><button data-v2-admin="status" data-id="${id}" data-status="Expired">Set Expired</button><button data-v2-admin="status" data-id="${id}" data-status="Superseded">Set Superseded</button><button data-v2-admin="status" data-id="${id}" data-status="Revoked" class="danger">Revoke</button></div></article>`;
}

async function copyLink(id) {
  const link = `${VERIFY_URL || 'https://verify.ask4prayers.com'}/?id=${encodeURIComponent(id)}`;
  await navigator.clipboard?.writeText(link);
  alert('Verification link copied.');
}

async function changeStatus(id, status) {
  const internalReason = status === 'Revoked' ? prompt('Internal reason for revocation. This will NOT be shown publicly.') : '';
  if (status === 'Revoked' && internalReason === null) return;
  const publicStatusMessage = publicMessage(status);
  await api.updateDoc(api.doc(db, COLLECTIONS.confirmations, id), { status, internalInvalidReason: internalReason || '', publicStatusMessage, invalidReason: '', updatedAt: api.serverTimestamp() });
  await writeAuditLog('v2_document_status_changed', { documentId: id, status }, auth.currentUser?.email || 'admin');
  await renderV2Admin();
}

function publicMessage(status) {
  if (status === 'Active') return 'This document is listed as active in the official records of The Prayer Project.';
  if (status === 'Expired') return 'This document exists, but it is past its active verification period.';
  if (status === 'Superseded') return 'This document exists, but a newer confirmation may have replaced it.';
  if (status === 'Revoked') return 'This document exists, but it is no longer active for public verification.';
  return 'This document exists, but its current status requires confirmation from The Prayer Project.';
}

async function copyReport() {
  const metrics = calculateMetrics(cache);
  const lines = [
    ['Metric', 'Value'],
    ['Total Records', metrics.total],
    ['Active', metrics.active],
    ['Revoked', metrics.revoked],
    ['Expired', metrics.expired]
  ];
  const csv = lines.map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
  await navigator.clipboard?.writeText(csv);
  alert('Summary report copied.');
}

function normalized(value) { return String(value || '').trim().toLowerCase(); }
function esc(value = '') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;'); }
