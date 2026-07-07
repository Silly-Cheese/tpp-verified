import { auth, db, COLLECTIONS, api, writeAuditLog, VERIFY_URL } from './firebase.js';
const $ = id => document.getElementById(id);
let records = [];
let audits = [];
let ready = false;
api.onAuthStateChanged(auth, async user => {
  if (!user) return;
  ready = true;
  setTimeout(renderV3Admin, 900);
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-v3-action]');
  if (!button || !ready) return;
  try {
    const action = button.dataset.v3Action;
    if (action === 'refresh') await renderV3Admin();
    if (action === 'batch-active') await batchStatus('Active');
    if (action === 'batch-expire') await batchStatus('Expired');
    if (action === 'batch-archive') await batchStatus('Archived');
    if (action === 'template') copyTemplate(button.dataset.template);
    if (action === 'audit-export') await exportAudit(button.dataset.id);
    if (action === 'history') await showHistory(button.dataset.id);
  } catch (error) { alert(error?.message || 'V3 action failed.'); }
}, true);

document.addEventListener('input', event => {
  if (['v3StatusFilter','v3YearFilter','v3NameFilter','v3HoursFilter'].includes(event.target?.id)) renderV3Lists();
});

async function renderV3Admin() {
  const host = $('adminContent');
  if (!host) return;
  await loadData();
  if (!$('v3AdminCenter')) {
    host.querySelector('.admin-grid')?.insertAdjacentHTML('beforebegin', `<section class="v2-admin-panel" id="v3AdminCenter"><p class="overline">Verification V3</p><h2>Advanced Verification Controls</h2><p class="panel-note">Document templates, lifecycle filters, batch actions, audit export, document history, and archive-first retention.</p><div class="v2-actions"><button class="primary" data-v3-action="refresh">Refresh V3</button><button data-v3-action="batch-active">Batch Active</button><button data-v3-action="batch-expire">Batch Expire</button><button data-v3-action="batch-archive">Batch Archive</button></div><div class="two-col"><label>Status Filter<select id="v3StatusFilter"><option value="">All Statuses</option><option>Active</option><option>Expired</option><option>Revoked</option><option>Superseded</option><option>Under Review</option><option>Archived</option></select></label><label>Issued Year<input id="v3YearFilter" placeholder="2026"></label></div><div class="two-col"><label>Volunteer / Role Search<input id="v3NameFilter" placeholder="Name or role"></label><label>Minimum Hours<input id="v3HoursFilter" type="number" min="0" placeholder="0"></label></div><div class="v2-admin-grid" id="v3Metrics"></div><section class="v2-admin-panel"><h3>Document Templates</h3><div class="v2-actions"><button data-v3-action="template" data-template="hours">Volunteer Hour Confirmation</button><button data-v3-action="template" data-template="training">Training Completion</button><button data-v3-action="template" data-template="chapter">Chapter Leadership</button><button data-v3-action="template" data-template="service">Service Participation Letter</button><button data-v3-action="template" data-template="recognition">Recognition Letter</button></div></section><div class="v2-record-list" id="v3RecordList"></div></section>`);
  }
  renderV3Lists();
}

async function loadData() {
  records = [];
  audits = [];
  try { const snap = await api.getDocs(api.collection(db, COLLECTIONS.confirmations)); snap.forEach(s => records.push({ id: s.id, ...s.data() })); } catch (error) {}
  try { const snap = await api.getDocs(api.collection(db, COLLECTIONS.auditLogs)); snap.forEach(s => audits.push({ id: s.id, ...s.data() })); } catch (error) {}
}
function renderV3Lists() {
  const filtered = filteredRecords();
  const metrics = { total: filtered.length, active: filtered.filter(x => norm(x.status) === 'active').length, inactive: filtered.filter(x => norm(x.status) !== 'active').length, archived: filtered.filter(x => norm(x.status) === 'archived').length };
  $('v3Metrics').innerHTML = `<article class="v2-admin-card"><strong>${metrics.total}</strong><span>Filtered</span></article><article class="v2-admin-card"><strong>${metrics.active}</strong><span>Active</span></article><article class="v2-admin-card"><strong>${metrics.inactive}</strong><span>Inactive</span></article><article class="v2-admin-card"><strong>${metrics.archived}</strong><span>Archived</span></article>`;
  $('v3RecordList').innerHTML = filtered.map(v3RecordCard).join('') || '<p class="panel-note">No records match these filters.</p>';
}
function filteredRecords() {
  const status = $('v3StatusFilter')?.value || '';
  const year = $('v3YearFilter')?.value.trim() || '';
  const name = ($('v3NameFilter')?.value || '').toLowerCase();
  const minHours = Number($('v3HoursFilter')?.value || 0);
  return records.filter(r => `${r.volunteerName || ''} ${r.positionRole || ''} ${r.documentId || ''}`.toLowerCase().includes(name) && (!status || norm(r.status) === norm(status)) && (!year || String(r.issuedOn || r.startDate || '').includes(year)) && Number(r.totalHours || 0) >= minHours);
}
function v3RecordCard(r) {
  const id = r.documentId || r.id;
  const link = `${VERIFY_URL || 'https://verify.ask4prayers.com'}?id=${encodeURIComponent(id)}`;
  return `<article class="v2-admin-record ${norm(r.status)}"><label><input type="checkbox" class="v3Select" value="${esc(id)}"> Select</label><h4>${esc(id)}</h4><p><strong>${esc(r.volunteerName || 'Volunteer')}</strong> · ${esc(r.positionRole || 'Volunteer')}</p><div class="v2-meta"><span>${esc(r.status || 'Active')}</span><span>${esc(r.totalHours || '0')} hours</span><span>${esc(r.issuedOn || 'No issue date')}</span></div><div class="v2-copy-box">${esc(link)}<br>TPP-HASH: ${checksum(id + (r.volunteerName || ''))}</div><div class="v2-actions"><button data-v3-action="history" data-id="${esc(id)}">History</button><button data-v3-action="audit-export" data-id="${esc(id)}">Export Audit</button></div></article>`;
}
async function batchStatus(status) { const ids = selectedIds(); if (!ids.length) return alert('Select at least one record first.'); if (!confirm(`Set ${ids.length} record(s) to ${status}?`)) return; for (const id of ids) await setStatus(id, status); await renderV3Admin(); }
async function setStatus(id, status) { await api.updateDoc(api.doc(db, COLLECTIONS.confirmations, id), { status, publicStatusMessage: publicMessage(status), updatedAt: api.serverTimestamp() }); await logHistory(id, 'status_changed', { status }); await writeAuditLog('v3_document_status_changed', { documentId: id, status }, auth.currentUser?.email || 'admin'); }
async function logHistory(id, action, details) { const historyId = `${id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; try { await api.setDoc(api.doc(db, 'documentHistory', historyId), { documentId: id, action, details, actor: auth.currentUser?.email || 'admin', createdAt: api.serverTimestamp() }); } catch (error) {} }
async function showHistory(id) { const rows = []; try { const snap = await api.getDocs(api.collection(db, 'documentHistory')); snap.forEach(s => { const d = s.data(); if (d.documentId === id) rows.push(d); }); } catch (error) {} alert(rows.length ? rows.map(r => `${r.action} - ${r.actor || 'system'}`).join('\n') : 'No history events found yet.'); }
async function exportAudit(id) { const rows = audits.filter(a => JSON.stringify(a).includes(id)); const csv = [['Action','Actor','Details'], ...rows.map(r => [r.action || '', r.actor || '', JSON.stringify(r.details || {})])].map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n'); await navigator.clipboard?.writeText(csv || 'No audit events found.'); alert('Audit export copied to clipboard.'); }
function copyTemplate(type) { const templates = { hours: 'This confirms that [Volunteer Name] completed [Hours] verified service hours with The Prayer Project between [Start Date] and [End Date].', training: 'This confirms that [Volunteer Name] completed assigned volunteer training through The Prayer Project.', chapter: 'This confirms that [Volunteer Name] served as a chapter leader or chapter support volunteer for The Prayer Project.', service: 'This letter confirms participation in a documented service activity through The Prayer Project.', recognition: 'The Prayer Project recognizes [Volunteer Name] for faithful service, encouragement, and volunteer commitment.' }; navigator.clipboard?.writeText(templates[type] || templates.hours); alert('Template copied to clipboard.'); }
function selectedIds() { return [...document.querySelectorAll('.v3Select:checked')].map(x => x.value); }
function publicMessage(status) { if (status === 'Active') return 'This document is listed as active in the official records of The Prayer Project.'; if (status === 'Expired') return 'This document exists, but it is past its active verification period.'; if (status === 'Superseded') return 'This document exists, but a newer confirmation may have replaced it.'; if (status === 'Archived') return 'This document is archived and is no longer active for public verification.'; if (status === 'Revoked') return 'This document exists, but it is no longer active for public verification.'; return 'This document exists, but its current status requires confirmation from The Prayer Project.'; }
function checksum(value) { let hash = 0; for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0; return Math.abs(hash).toString(16).toUpperCase().slice(0, 4) + '-' + Math.abs(hash * 31).toString(16).toUpperCase().slice(0, 4); }
function norm(value = '') { return String(value || '').trim().toLowerCase(); }
function esc(value = '') { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;'); }
