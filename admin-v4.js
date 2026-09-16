import {
  auth,
  db,
  COLLECTIONS,
  api,
  isAuthorizedAdmin,
  generateDocumentId,
  writeAuditLog,
  OFFICIAL_ADMIN_EMAIL,
  VERIFY_URL
} from './firebase.js';

const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  view: 'overview',
  records: [],
  requests: [],
  audits: [],
  selected: new Set(),
  editKey: null,
  filters: { search: '', status: '', year: '', minHours: '' },
  requestFilters: { search: '', status: '' },
  busy: false
};

const pageMeta = {
  overview: ['Verification workspace', 'Overview', 'A clear view of records, requests, and document health.'],
  records: ['Document management', 'Verification records', 'Search, review, update, print, and retain official records.'],
  create: ['Document issuance', 'New verification', 'Create an official volunteer confirmation record.'],
  edit: ['Document management', 'Edit verification', 'Update record details while preserving its document identity.'],
  requests: ['Verification support', 'Requests', 'Review and resolve questions submitted through the public portal.'],
  reports: ['Operations reporting', 'Reports', 'Understand verification activity and export official data.'],
  templates: ['Official correspondence', 'Templates', 'Copy polished language for common verification letters.']
};

const templates = [
  {
    id: 'hours',
    title: 'Volunteer Hour Confirmation',
    description: 'This confirms that [Volunteer Name] completed [Hours] verified service hours with The Prayer Project between [Start Date] and [End Date].'
  },
  {
    id: 'training',
    title: 'Training Completion',
    description: 'This confirms that [Volunteer Name] successfully completed the volunteer training assigned by The Prayer Project.'
  },
  {
    id: 'leadership',
    title: 'Chapter Leadership',
    description: 'This confirms that [Volunteer Name] served as a chapter leader or chapter support volunteer for The Prayer Project.'
  },
  {
    id: 'recognition',
    title: 'Service Recognition',
    description: 'The Prayer Project recognizes [Volunteer Name] for faithful service, encouragement, and meaningful volunteer commitment.'
  }
];

const loginView = $('loginView');
const appView = $('appView');
const workspace = $('workspaceContent');

$('loginForm').addEventListener('submit', signIn);
$('togglePassword').addEventListener('click', togglePassword);
$('logoutButton').addEventListener('click', signOut);
$('refreshButton').addEventListener('click', () => refreshData(true));
$('headerCreateButton').addEventListener('click', () => navigate('create'));
$('openNav').addEventListener('click', openNav);
$('closeNav').addEventListener('click', closeNav);
$('navScrim').addEventListener('click', closeNav);
$('statusValue').addEventListener('change', updateStatusReasonVisibility);
$('statusForm').addEventListener('submit', saveStatusFromDialog);

document.addEventListener('click', handleClick);
document.addEventListener('input', handleInput);
document.addEventListener('change', handleChange);
document.addEventListener('submit', handleSubmit);
document.addEventListener('keydown', handleKeyboard);

api.onAuthStateChanged(auth, async (user) => {
  if (!user || !(await isAuthorizedAdmin(user.email))) {
    state.user = null;
    showLogin();
    if (user) await api.signOut(auth);
    return;
  }
  state.user = user;
  showApp();
  await refreshData(false);
});

async function signIn(event) {
  event.preventDefault();
  const button = $('loginButton');
  const message = $('authMessage');
  button.disabled = true;
  button.textContent = 'Signing in…';
  message.classList.remove('error');
  message.textContent = 'Checking administrator credentials…';

  try {
    const result = await api.signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPassword').value);
    if (!(await isAuthorizedAdmin(result.user.email))) {
      await api.signOut(auth);
      throw new Error('This account is not authorized to manage verification records.');
    }
    await writeAuditLog('admin_login', { email: result.user.email }, result.user.email);
    $('loginPassword').value = '';
  } catch (error) {
    console.error(error);
    message.classList.add('error');
    message.textContent = friendlyError(error, 'Authentication failed. Check the email, password, and Firebase configuration.');
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in to verification';
  }
}

async function signOut() {
  try {
    if (state.user?.email) await writeAuditLog('admin_logout', {}, state.user.email);
  } catch (error) {
    console.warn('Could not write logout audit event.', error);
  }
  await api.signOut(auth);
  state.records = [];
  state.requests = [];
  state.audits = [];
  state.selected.clear();
  showLogin();
}

function togglePassword() {
  const input = $('loginPassword');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('togglePassword').textContent = show ? 'Hide' : 'Show';
  $('togglePassword').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

function showLogin() {
  loginView.hidden = false;
  appView.hidden = true;
  closeNav();
}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  const email = state.user?.email || OFFICIAL_ADMIN_EMAIL;
  $('adminEmail').textContent = email;
  $('adminName').textContent = email === OFFICIAL_ADMIN_EMAIL ? 'Christopher Shelley' : 'Administrator';
  $('adminInitials').textContent = initials($('adminName').textContent);
  render();
}

async function refreshData(notify = false) {
  if (!state.user || state.busy) return;
  state.busy = true;
  setSync('loading', 'Syncing');
  $('refreshButton').disabled = true;

  const readCollection = async (name) => {
    const rows = [];
    const snapshot = await api.getDocs(api.collection(db, name));
    snapshot.forEach((item) => rows.push({ key: item.id, ...item.data() }));
    return rows;
  };

  try {
    const [recordsResult, requestsResult, auditsResult] = await Promise.allSettled([
      readCollection(COLLECTIONS.confirmations),
      readCollection('verificationRequests'),
      readCollection(COLLECTIONS.auditLogs)
    ]);

    if (recordsResult.status === 'rejected') throw recordsResult.reason;
    state.records = recordsResult.value.sort((a, b) => dateNumber(b.updatedAt || b.createdAt || b.issuedOn) - dateNumber(a.updatedAt || a.createdAt || a.issuedOn));
    state.requests = requestsResult.status === 'fulfilled'
      ? requestsResult.value.sort((a, b) => dateNumber(b.updatedAt || b.createdAt) - dateNumber(a.updatedAt || a.createdAt))
      : [];
    state.audits = auditsResult.status === 'fulfilled' ? auditsResult.value : [];
    state.selected = new Set([...state.selected].filter((key) => state.records.some((record) => record.key === key)));

    updateNavigationCounts();
    setSync('', 'Ready');
    render();
    if (notify) toast('Workspace refreshed', 'The latest verification records and requests are now loaded.');
  } catch (error) {
    console.error(error);
    setSync('error', 'Sync failed');
    toast('Could not refresh data', friendlyError(error, 'Check Firestore access and try again.'), 'error');
  } finally {
    state.busy = false;
    $('refreshButton').disabled = false;
  }
}

function setSync(mode, label) {
  const status = $('syncStatus');
  status.className = `sync-status${mode ? ` ${mode}` : ''}`;
  status.innerHTML = `<span></span> ${escapeHtml(label)}`;
}

function updateNavigationCounts() {
  $('navRecordCount').textContent = state.records.length;
  $('navRequestCount').textContent = state.requests.filter((request) => normalize(request.status || 'open') !== 'closed').length;
}

function navigate(view, options = {}) {
  state.view = view;
  state.editKey = options.editKey || null;
  if (view !== 'records') state.selected.clear();
  closeNav();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  if (appView.hidden) return;
  const meta = pageMeta[state.view] || pageMeta.overview;
  $('pageEyebrow').textContent = meta[0];
  $('pageTitle').textContent = meta[1];
  $('pageSubtitle').textContent = meta[2];
  $('headerCreateButton').hidden = ['create', 'edit'].includes(state.view);

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.view || (state.view === 'edit' && button.dataset.view === 'records'));
  });

  const renderers = {
    overview: renderOverview,
    records: renderRecords,
    create: () => renderRecordForm(),
    edit: () => renderRecordForm(getRecord(state.editKey)),
    requests: renderRequests,
    reports: renderReports,
    templates: renderTemplates
  };
  (renderers[state.view] || renderOverview)();
}

function renderOverview() {
  const metrics = getMetrics();
  const recent = state.records.slice(0, 6);
  const openRequests = state.requests.filter((request) => normalize(request.status || 'open') !== 'closed').slice(0, 4);

  workspace.innerHTML = `
    <div class="page-stack">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Official verification operations</p>
          <h2>Every record, request, and status in one place.</h2>
          <p>Issue trusted documents, protect private internal notes, and keep the public verification portal accurate without moving between overlapping tools.</p>
        </div>
        <div class="hero-actions">
          <button class="button button-primary" type="button" data-view="create">Create verification</button>
          <button class="button button-secondary" type="button" data-view="records">Browse records</button>
        </div>
      </section>

      ${renderStats(metrics)}

      <div class="dashboard-grid">
        <section class="panel">
          <div class="panel-header">
            <div><h2>Recent records</h2><p>The latest verification documents updated in the system.</p></div>
            <button class="panel-link" type="button" data-view="records">View all records</button>
          </div>
          ${recent.length ? renderRecordTable(recent, false) : renderEmpty('No verification records yet', 'Create the first record to begin building the official verification registry.', 'create')}
        </section>

        <section class="panel">
          <div class="panel-header"><div><h2>Quick actions</h2><p>Common tasks, one click away.</p></div></div>
          <div class="quick-actions">
            ${quickAction('＋', 'Issue a new record', 'Create a volunteer verification document.', 'create')}
            ${quickAction('⌕', 'Find a verification', 'Search by name, ID, role, email, or status.', 'records')}
            ${quickAction('◇', 'Review requests', `${openRequests.length} recent unresolved request${openRequests.length === 1 ? '' : 's'}.`, 'requests')}
            ${quickAction('↗', 'Export reports', 'Download records or audit activity as CSV.', 'reports')}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header">
          <div><h2>Request activity</h2><p>Messages that may require an administrator response or record review.</p></div>
          <button class="panel-link" type="button" data-view="requests">Open request inbox</button>
        </div>
        ${openRequests.length ? `<div class="request-list">${openRequests.map(requestCard).join('')}</div>` : renderEmpty('Inbox is clear', 'There are no unresolved verification requests right now.')}
      </section>
    </div>`;
}

function renderStats(metrics) {
  return `<section class="stats-grid">
    ${statCard('▤', metrics.total, 'Total records', 'Official documents')}
    ${statCard('✓', metrics.active, 'Active records', `${metrics.activeRate}% of registry`)}
    ${statCard('◇', metrics.openRequests, 'Open requests', 'Awaiting attention')}
    ${statCard('◷', metrics.expiringSoon, 'Expiring soon', 'Within 30 days')}
  </section>`;
}

function statCard(icon, value, label, detail) {
  return `<article class="stat-card"><div class="stat-top"><span class="stat-icon">${icon}</span><span class="stat-trend">Live</span></div><strong>${escapeHtml(value)}</strong><p>${escapeHtml(label)} · ${escapeHtml(detail)}</p></article>`;
}

function quickAction(icon, title, detail, view) {
  return `<button class="quick-action" type="button" data-view="${view}"><span class="quick-action-icon">${icon}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><span class="quick-action-arrow">→</span></button>`;
}

function renderRecords() {
  const filtered = filteredRecords();
  const years = [...new Set(state.records.map((record) => recordYear(record)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const selectedCount = state.selected.size;

  workspace.innerHTML = `
    <div class="page-stack">
      <section class="panel">
        <div class="panel-header">
          <div><h2>Record registry</h2><p>${filtered.length} of ${state.records.length} records shown. Use / to focus search.</p></div>
          <button class="button button-primary" type="button" data-view="create">New verification</button>
        </div>
        <div class="toolbar">
          <div class="toolbar-group"><label for="recordSearch">Search</label><span class="search-input-wrap"><input id="recordSearch" type="search" placeholder="Name, ID, email, role…" value="${escapeAttr(state.filters.search)}"></span></div>
          <div class="toolbar-group"><label for="recordStatus">Status</label><select id="recordStatus"><option value="">All statuses</option>${statusOptions(state.filters.status, true)}</select></div>
          <div class="toolbar-group"><label for="recordYear">Issued year</label><select id="recordYear"><option value="">All years</option>${years.map((year) => `<option value="${year}" ${state.filters.year === year ? 'selected' : ''}>${year}</option>`).join('')}</select></div>
          <div class="toolbar-group"><label for="recordHours">Minimum hours</label><input id="recordHours" type="number" min="0" step="0.25" placeholder="0" value="${escapeAttr(state.filters.minHours)}"></div>
          <button class="button button-secondary" type="button" data-action="clear-filters">Clear</button>
        </div>
      </section>

      ${selectedCount ? `<section class="bulk-bar"><p>${selectedCount} record${selectedCount === 1 ? '' : 's'} selected</p><div class="bulk-actions"><button class="button button-secondary" type="button" data-action="bulk-status" data-status="Active">Set active</button><button class="button button-secondary" type="button" data-action="bulk-status" data-status="Expired">Expire</button><button class="button button-danger" type="button" data-action="bulk-status" data-status="Archived">Archive</button></div></section>` : ''}

      <section class="panel">
        ${filtered.length ? renderRecordTable(filtered, true) : renderEmpty('No records match these filters', 'Try clearing a filter or create a new verification record.', 'create')}
      </section>
    </div>`;
}

function renderRecordTable(records, selectable) {
  return `<div class="data-table">
    <div class="table-row table-head">
      <span>${selectable ? `<input id="selectAllRecords" class="checkbox" type="checkbox" aria-label="Select all visible records" ${records.length && records.every((record) => state.selected.has(record.key)) ? 'checked' : ''}>` : ''}</span>
      <span>Volunteer / document</span><span>Role</span><span>Hours</span><span>Issued</span><span>Status</span><span></span>
    </div>
    ${records.map((record) => recordRow(record, selectable)).join('')}
  </div>`;
}

function recordRow(record, selectable) {
  const id = record.documentId || record.key;
  const status = record.status || 'Active';
  return `<article class="table-row">
    <span>${selectable ? `<input class="checkbox record-select" type="checkbox" value="${escapeAttr(record.key)}" aria-label="Select ${escapeAttr(record.volunteerName || id)}" ${state.selected.has(record.key) ? 'checked' : ''}>` : ''}</span>
    <span class="record-main"><strong>${escapeHtml(record.volunteerName || 'Unnamed volunteer')}</strong><small>${escapeHtml(id)}</small></span>
    <span class="table-cell">${escapeHtml(record.positionRole || 'Volunteer')}</span>
    <span class="table-cell">${escapeHtml(formatHours(record.totalHours))}</span>
    <span class="table-cell">${escapeHtml(formatDate(record.issuedOn || record.createdAt || record.startDate))}</span>
    <span><span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span></span>
    <details class="action-menu"><summary aria-label="Actions for ${escapeAttr(record.volunteerName || id)}">•••</summary><div class="action-menu-popover">
      <button type="button" data-action="view-record" data-key="${escapeAttr(record.key)}">View details</button>
      <button type="button" data-action="edit-record" data-key="${escapeAttr(record.key)}">Edit record</button>
      <button type="button" data-action="copy-link" data-key="${escapeAttr(record.key)}">Copy verification link</button>
      <button type="button" data-action="print-record" data-key="${escapeAttr(record.key)}">Open print form</button>
      <button type="button" data-action="record-history" data-key="${escapeAttr(record.key)}">View history</button>
      <button type="button" data-action="open-status" data-key="${escapeAttr(record.key)}">Change status</button>
      <button type="button" class="danger" data-action="delete-record" data-key="${escapeAttr(record.key)}">Delete permanently</button>
    </div></details>
  </article>`;
}

function filteredRecords() {
  const search = normalize(state.filters.search);
  const minimumHours = Number(state.filters.minHours || 0);
  return state.records.filter((record) => {
    const haystack = normalize(`${record.documentId || record.key} ${record.volunteerName || ''} ${record.email || ''} ${record.positionRole || ''} ${record.status || 'Active'}`);
    return (!search || haystack.includes(search))
      && (!state.filters.status || normalize(record.status || 'Active') === normalize(state.filters.status))
      && (!state.filters.year || recordYear(record) === state.filters.year)
      && Number(record.totalHours || 0) >= minimumHours;
  });
}

function renderRecordForm(record = null) {
  if (state.view === 'edit' && !record) {
    navigate('records');
    toast('Record not found', 'The selected verification record could not be loaded.', 'error');
    return;
  }
  const editing = Boolean(record);
  const id = record?.documentId || '';

  workspace.innerHTML = `<section class="panel form-panel">
    <div class="panel-header">
      <div><h2>${editing ? `Edit ${escapeHtml(id)}` : 'Issue a verification record'}</h2><p>${editing ? 'Changes are saved to the existing document and recorded in the audit log.' : 'Complete the fields below to create an official public verification document.'}</p></div>
      <button class="button button-secondary" type="button" data-view="records">Cancel</button>
    </div>

    <form id="recordEditor" data-key="${escapeAttr(record?.key || '')}">
      <section class="form-section">
        <div class="form-section-header"><h3>Volunteer information</h3><p>Core identity and contact details for the person receiving the verification.</p></div>
        <div class="form-grid">
          <label class="field"><span>Volunteer name *</span><input id="fieldVolunteerName" value="${escapeAttr(record?.volunteerName || '')}" required></label>
          <label class="field"><span>Position or role</span><input id="fieldRole" value="${escapeAttr(record?.positionRole || 'Volunteer')}"></label>
          <label class="field"><span>Email</span><input id="fieldEmail" type="email" value="${escapeAttr(record?.email || '')}"></label>
          <label class="field"><span>Phone</span><input id="fieldPhone" type="tel" value="${escapeAttr(record?.phone || '')}"></label>
          <label class="field"><span>Age</span><input id="fieldAge" inputmode="numeric" value="${escapeAttr(record?.age || '')}"></label>
          <label class="field"><span>Initial status</span><select id="fieldStatus">${statusOptions(record?.status || 'Active')}</select></label>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-header"><h3>Service details</h3><p>Document the date range, times, verified total, and duties performed.</p></div>
        <div class="form-grid">
          <label class="field"><span>Start date</span><input id="fieldStartDate" type="date" value="${escapeAttr(toInputDate(record?.startDate))}"></label>
          <label class="field"><span>End date</span><input id="fieldEndDate" type="date" value="${escapeAttr(toInputDate(record?.endDate))}"></label>
          <label class="field"><span>Service start time</span><input id="fieldStartTime" type="time" value="${escapeAttr(record?.serviceStartTime || '')}"></label>
          <label class="field"><span>Service end time</span><input id="fieldEndTime" type="time" value="${escapeAttr(record?.serviceEndTime || '')}"></label>
          <label class="field"><span>Total verified hours *</span><span class="input-with-button"><input id="fieldHours" type="number" min="0" step="0.25" value="${escapeAttr(record?.totalHours || '')}" required><button class="button button-secondary" type="button" data-action="calculate-hours">Calculate</button></span></label>
          <label class="field"><span>Valid until</span><input id="fieldValidUntil" type="date" value="${escapeAttr(toInputDate(record?.validUntil || record?.endDate))}"></label>
          <label class="field full"><span>Description of duties</span><textarea id="fieldDuties" placeholder="Describe the volunteer work completed.">${escapeHtml(record?.duties || '')}</textarea></label>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-header"><h3>Administrative notes</h3><p>Private notes remain in Firestore and are never displayed on the public verification page.</p></div>
        <div class="form-grid">
          <label class="field full"><span>Internal notes</span><textarea id="fieldNotes" placeholder="Optional internal context, follow-up information, or documentation notes.">${escapeHtml(record?.internalNotes || '')}</textarea></label>
        </div>
      </section>

      <div class="form-actions">
        <button class="button button-secondary" type="button" data-view="records">Cancel</button>
        <button id="saveRecordButton" class="button button-primary" type="submit">${editing ? 'Save record changes' : 'Create verification record'}</button>
      </div>
    </form>
  </section>`;
}

async function saveRecord(event) {
  event.preventDefault();
  const form = event.target;
  const existing = getRecord(form.dataset.key);
  const button = $('saveRecordButton');
  const status = $('fieldStatus').value;
  const documentId = existing?.documentId || generateDocumentId();
  const recordKey = existing?.key || documentId;
  const data = {
    documentId,
    volunteerName: value('fieldVolunteerName'),
    age: value('fieldAge'),
    email: value('fieldEmail'),
    phone: value('fieldPhone'),
    positionRole: value('fieldRole') || 'Volunteer',
    duties: value('fieldDuties'),
    startDate: value('fieldStartDate'),
    endDate: value('fieldEndDate'),
    serviceStartTime: value('fieldStartTime'),
    serviceEndTime: value('fieldEndTime'),
    totalHours: value('fieldHours'),
    validFrom: value('fieldStartDate'),
    validUntil: value('fieldValidUntil') || value('fieldEndDate'),
    status,
    internalNotes: value('fieldNotes'),
    issuedOn: existing?.issuedOn || new Date().toLocaleDateString(),
    verifiedBy: 'Christopher Shelley',
    verifiedByEmail: OFFICIAL_ADMIN_EMAIL,
    invalidReason: '',
    internalInvalidReason: existing?.internalInvalidReason || '',
    publicStatusMessage: publicMessage(status),
    updatedAt: api.serverTimestamp()
  };
  if (!existing) data.createdAt = api.serverTimestamp();

  button.disabled = true;
  button.textContent = existing ? 'Saving changes…' : 'Creating record…';
  try {
    await api.setDoc(api.doc(db, COLLECTIONS.confirmations, recordKey), data, { merge: Boolean(existing) });
    await writeHistory(documentId, existing ? 'record_updated' : 'record_created', { status, totalHours: data.totalHours });
    await writeAuditLog(existing ? 'record_updated' : 'record_created', { documentId, status }, state.user?.email || 'admin');
    await refreshData(false);
    navigate('records');
    toast(existing ? 'Record updated' : 'Verification created', existing ? `${documentId} was saved successfully.` : `${documentId} is now available for public verification.`);
  } catch (error) {
    console.error(error);
    toast('Could not save record', friendlyError(error, 'Review the form and Firestore permissions, then try again.'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = existing ? 'Save record changes' : 'Create verification record';
  }
}

function renderRequests() {
  const search = normalize(state.requestFilters.search);
  const rows = state.requests.filter((request) => {
    const haystack = normalize(`${request.documentId || ''} ${request.requesterEmail || request.email || ''} ${request.message || ''}`);
    return (!search || haystack.includes(search))
      && (!state.requestFilters.status || normalize(request.status || 'open') === normalize(state.requestFilters.status));
  });

  workspace.innerHTML = `<div class="page-stack">
    <section class="panel">
      <div class="panel-header"><div><h2>Request inbox</h2><p>${rows.length} of ${state.requests.length} requests shown.</p></div></div>
      <div class="toolbar">
        <div class="toolbar-group"><label for="requestSearch">Search</label><span class="search-input-wrap"><input id="requestSearch" type="search" placeholder="Document ID, email, message…" value="${escapeAttr(state.requestFilters.search)}"></span></div>
        <div class="toolbar-group"><label for="requestStatus">Status</label><select id="requestStatus"><option value="">All statuses</option>${['open','waiting','closed'].map((status) => `<option value="${status}" ${state.requestFilters.status === status ? 'selected' : ''}>${titleCase(status)}</option>`).join('')}</select></div>
        <button class="button button-secondary" type="button" data-action="clear-request-filters">Clear</button>
      </div>
    </section>
    <section class="panel">
      ${rows.length ? `<div class="request-list">${rows.map(requestCard).join('')}</div>` : renderEmpty('No requests found', 'There are no verification requests matching the current filters.')}
    </section>
  </div>`;
}

function requestCard(request) {
  const email = request.requesterEmail || request.email || 'No email provided';
  const status = request.status || 'open';
  const title = request.documentId || request.subject || 'General verification request';
  return `<article class="request-card">
    <span class="request-avatar">${escapeHtml(initials(email))}</span>
    <div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(request.message || 'No message was included with this request.')}</p>
      <div class="request-meta"><span>${escapeHtml(email)}</span><span>${escapeHtml(formatDate(request.createdAt || request.updatedAt))}</span><span class="status-badge ${statusClass(status)}">${escapeHtml(titleCase(status))}</span></div>
    </div>
    <div class="request-actions">
      <button class="button button-secondary" type="button" data-action="request-status" data-key="${escapeAttr(request.key)}" data-status="open">Open</button>
      <button class="button button-secondary" type="button" data-action="request-status" data-key="${escapeAttr(request.key)}" data-status="waiting">Waiting</button>
      <button class="button button-primary" type="button" data-action="request-status" data-key="${escapeAttr(request.key)}" data-status="closed">Close</button>
    </div>
  </article>`;
}

function renderReports() {
  const metrics = getMetrics();
  const statusCounts = countByStatus(state.records);
  const maximum = Math.max(1, ...Object.values(statusCounts));
  const totalHours = state.records.reduce((sum, record) => sum + Number(record.totalHours || 0), 0);

  workspace.innerHTML = `<div class="page-stack">
    ${renderStats(metrics)}
    <div class="report-grid">
      <section class="panel">
        <div class="panel-header"><div><h2>Document lifecycle</h2><p>Current distribution of verification records by public status.</p></div></div>
        <div class="status-bars">${Object.entries(statusCounts).map(([status, count]) => `<div class="status-bar-row"><div class="status-bar-label"><span>${escapeHtml(status)}</span><strong>${count}</strong></div><div class="status-bar-track"><div class="status-bar-fill" style="width:${Math.round((count / maximum) * 100)}%"></div></div></div>`).join('') || '<p class="field-help">No record data is available.</p>'}</div>
      </section>

      <section class="panel">
        <div class="panel-header"><div><h2>Registry totals</h2><p>High-level service and document volume.</p></div></div>
        <div class="quick-actions">
          ${summaryLine('Verified service hours', formatHours(totalHours))}
          ${summaryLine('Inactive documents', metrics.inactive)}
          ${summaryLine('Archived documents', metrics.archived)}
          ${summaryLine('Audit events loaded', state.audits.length)}
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="panel-header"><div><h2>Exports</h2><p>Download portable CSV files for reporting, review, or secure storage.</p></div></div>
      <div class="export-actions">
        ${exportCard('▤', 'Verification records', `${state.records.length} documents with identity, service, status, and date fields.`, 'export-records')}
        ${exportCard('↗', 'Audit activity', `${state.audits.length} system events currently loaded.`, 'export-audits')}
        ${exportCard('◇', 'Verification requests', `${state.requests.length} public support requests and their current status.`, 'export-requests')}
      </div>
    </section>
  </div>`;
}

function summaryLine(label, valueText) {
  return `<div class="quick-action"><span class="quick-action-icon">•</span><span><strong>${escapeHtml(label)}</strong><small>Current registry value</small></span><strong>${escapeHtml(valueText)}</strong></div>`;
}

function exportCard(icon, title, detail, action) {
  return `<article class="export-card"><span class="quick-action-icon">${icon}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span><button class="button button-secondary" type="button" data-action="${action}">Download CSV</button></article>`;
}

function renderTemplates() {
  workspace.innerHTML = `<div class="page-stack"><section class="hero-panel"><div class="hero-copy"><p class="eyebrow">Official language library</p><h2>Consistent wording for every confirmation.</h2><p>Copy a polished template, replace the bracketed fields, and use it in an email, letter, or printed confirmation.</p></div></section><section class="template-grid">${templates.map((template) => `<article class="template-card"><div><p class="eyebrow">Template</p><h3>${escapeHtml(template.title)}</h3></div><p>${escapeHtml(template.description)}</p><button class="button button-secondary" type="button" data-action="copy-template" data-template="${escapeAttr(template.id)}">Copy template</button></article>`).join('')}</section></div>`;
}

function renderEmpty(title, detail, actionView = '') {
  return `<div class="empty-state"><div><span class="empty-state-icon">◇</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>${actionView ? `<button class="button button-primary" type="button" data-view="${actionView}">Create verification</button>` : ''}</div></div>`;
}

async function handleClick(event) {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    navigate(viewButton.dataset.view);
    return;
  }

  const closeButton = event.target.closest('[data-close-dialog]');
  if (closeButton) {
    closeDialog(closeButton.dataset.closeDialog);
    return;
  }

  const action = event.target.closest('[data-action]');
  if (!action) return;

  try {
    switch (action.dataset.action) {
      case 'clear-filters':
        state.filters = { search: '', status: '', year: '', minHours: '' };
        renderRecords();
        break;
      case 'clear-request-filters':
        state.requestFilters = { search: '', status: '' };
        renderRequests();
        break;
      case 'calculate-hours':
        calculateFormHours();
        break;
      case 'view-record':
        openRecordDialog(action.dataset.key);
        break;
      case 'edit-record':
        closeDialog('recordDialog');
        navigate('edit', { editKey: action.dataset.key });
        break;
      case 'copy-link':
        await copyVerificationLink(action.dataset.key);
        break;
      case 'print-record':
        printRecord(action.dataset.key);
        break;
      case 'record-history':
        await openHistoryDialog(action.dataset.key);
        break;
      case 'open-status':
        openStatusDialog(action.dataset.key);
        break;
      case 'delete-record':
        await deleteRecord(action.dataset.key);
        break;
      case 'bulk-status':
        await bulkStatus(action.dataset.status);
        break;
      case 'request-status':
        await updateRequestStatus(action.dataset.key, action.dataset.status);
        break;
      case 'copy-template':
        await copyTemplate(action.dataset.template);
        break;
      case 'export-records':
        exportRecords();
        break;
      case 'export-audits':
        exportAudits();
        break;
      case 'export-requests':
        exportRequests();
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(error);
    toast('Action failed', friendlyError(error, 'The requested action could not be completed.'), 'error');
  }
}

function handleInput(event) {
  if (event.target.id === 'recordSearch') {
    state.filters.search = event.target.value;
    rerenderWithFocus('recordSearch', renderRecords, event.target.selectionStart);
  }
  if (event.target.id === 'recordHours') {
    state.filters.minHours = event.target.value;
    rerenderWithFocus('recordHours', renderRecords, event.target.selectionStart);
  }
  if (event.target.id === 'requestSearch') {
    state.requestFilters.search = event.target.value;
    rerenderWithFocus('requestSearch', renderRequests, event.target.selectionStart);
  }
}

function handleChange(event) {
  if (event.target.id === 'recordStatus') {
    state.filters.status = event.target.value;
    renderRecords();
  }
  if (event.target.id === 'recordYear') {
    state.filters.year = event.target.value;
    renderRecords();
  }
  if (event.target.id === 'requestStatus') {
    state.requestFilters.status = event.target.value;
    renderRequests();
  }
  if (event.target.id === 'selectAllRecords') {
    filteredRecords().forEach((record) => event.target.checked ? state.selected.add(record.key) : state.selected.delete(record.key));
    renderRecords();
  }
  if (event.target.matches('.record-select')) {
    event.target.checked ? state.selected.add(event.target.value) : state.selected.delete(event.target.value);
    renderRecords();
  }
}

function handleSubmit(event) {
  if (event.target.id === 'recordEditor') saveRecord(event);
}

function handleKeyboard(event) {
  const tag = document.activeElement?.tagName;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
  if (event.key === 'Escape') {
    document.querySelectorAll('.dialog-backdrop:not([hidden])').forEach((dialog) => closeDialog(dialog.id));
    closeNav();
  }
  if (!typing && event.key === '/') {
    event.preventDefault();
    navigate('records');
    setTimeout(() => $('recordSearch')?.focus(), 30);
  }
  if (!typing && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    navigate('create');
  }
}

function openNav() {
  $('sidebar').classList.add('open');
  $('navScrim').hidden = false;
}

function closeNav() {
  $('sidebar').classList.remove('open');
  $('navScrim').hidden = true;
}

function openDialog(id) {
  const dialog = $(id);
  dialog.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => dialog.querySelector('button, input, select, textarea')?.focus(), 20);
}

function closeDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  dialog.hidden = true;
  if (![...document.querySelectorAll('.dialog-backdrop')].some((item) => !item.hidden)) document.body.style.overflow = '';
}

function openRecordDialog(key) {
  const record = getRecord(key);
  if (!record) return;
  const id = record.documentId || record.key;
  $('recordDialogTitle').textContent = id;
  $('recordDialogBody').innerHTML = `<div class="detail-hero"><div><p class="eyebrow">${escapeHtml(record.positionRole || 'Volunteer')}</p><h3>${escapeHtml(record.volunteerName || 'Unnamed volunteer')}</h3><p>${escapeHtml(id)}</p></div><span class="status-badge ${statusClass(record.status || 'Active')}">${escapeHtml(record.status || 'Active')}</span></div><div class="detail-grid">
    ${detailItem('Verified hours', formatHours(record.totalHours))}
    ${detailItem('Service dates', `${formatDate(record.startDate)} – ${formatDate(record.endDate)}`)}
    ${detailItem('Email', record.email || 'Not provided')}
    ${detailItem('Phone', record.phone || 'Not provided')}
    ${detailItem('Issued', formatDate(record.issuedOn || record.createdAt))}
    ${detailItem('Valid until', formatDate(record.validUntil || record.endDate))}
    ${detailItem('Duties', record.duties || 'No duties were recorded.', true)}
    ${detailItem('Internal notes', record.internalNotes || record.internalInvalidReason || 'No internal notes.', true)}
  </div><div class="detail-actions"><button class="button button-secondary" type="button" data-action="copy-link" data-key="${escapeAttr(record.key)}">Copy public link</button><button class="button button-secondary" type="button" data-action="print-record" data-key="${escapeAttr(record.key)}">Open print form</button><button class="button button-primary" type="button" data-action="edit-record" data-key="${escapeAttr(record.key)}">Edit record</button></div>`;
  openDialog('recordDialog');
}

function detailItem(label, text, full = false) {
  return `<div class="detail-item${full ? ' full' : ''}"><small>${escapeHtml(label)}</small><span>${escapeHtml(text || 'Not listed')}</span></div>`;
}

function openStatusDialog(key) {
  const record = getRecord(key);
  if (!record) return;
  $('statusRecordKey').value = key;
  $('statusValue').value = record.status || 'Active';
  $('statusReason').value = record.internalInvalidReason || '';
  $('statusDialogTitle').textContent = `Update ${record.documentId || record.key}`;
  updateStatusReasonVisibility();
  openDialog('statusDialog');
}

function updateStatusReasonVisibility() {
  const needsReason = $('statusValue').value === 'Revoked';
  $('statusReasonField').hidden = !needsReason;
  $('statusReason').required = needsReason;
}

async function saveStatusFromDialog(event) {
  event.preventDefault();
  const key = $('statusRecordKey').value;
  const status = $('statusValue').value;
  const reason = $('statusReason').value.trim();
  await updateRecordStatus(key, status, reason);
  closeDialog('statusDialog');
}

async function updateRecordStatus(key, status, internalReason = '') {
  const record = getRecord(key);
  if (!record) return;
  await api.updateDoc(api.doc(db, COLLECTIONS.confirmations, key), {
    status,
    invalidReason: '',
    internalInvalidReason: status === 'Revoked' ? internalReason : (record.internalInvalidReason || ''),
    publicStatusMessage: publicMessage(status),
    updatedAt: api.serverTimestamp()
  });
  await writeHistory(record.documentId || key, 'status_changed', { status });
  await writeAuditLog('record_status_changed', { documentId: record.documentId || key, status }, state.user?.email || 'admin');
  await refreshData(false);
  toast('Status updated', `${record.documentId || key} is now ${status}.`);
}

async function bulkStatus(status) {
  const keys = [...state.selected];
  if (!keys.length) return;
  if (!window.confirm(`Set ${keys.length} selected record${keys.length === 1 ? '' : 's'} to ${status}?`)) return;
  for (const key of keys) {
    const record = getRecord(key);
    if (!record) continue;
    const documentId = record.documentId || key;
    await api.updateDoc(api.doc(db, COLLECTIONS.confirmations, key), {
      status,
      invalidReason: '',
      publicStatusMessage: publicMessage(status),
      updatedAt: api.serverTimestamp()
    });
    await writeHistory(documentId, 'status_changed', { status, bulk: true });
    await writeAuditLog('record_status_changed', { documentId, status, bulk: true }, state.user?.email || 'admin');
  }
  state.selected.clear();
  await refreshData(false);
  toast('Bulk status updated', `${keys.length} record${keys.length === 1 ? '' : 's'} set to ${status}.`);
}

async function deleteRecord(key) {
  const record = getRecord(key);
  if (!record) return;
  const id = record.documentId || key;
  if (!window.confirm(`Permanently delete ${id}? This cannot be undone. Archiving is recommended for official retention.`)) return;
  await api.deleteDoc(api.doc(db, COLLECTIONS.confirmations, key));
  await writeAuditLog('record_deleted', { documentId: id }, state.user?.email || 'admin');
  await refreshData(false);
  toast('Record deleted', `${id} was permanently removed from Firestore.`);
}

async function copyVerificationLink(key) {
  const record = getRecord(key);
  if (!record) return;
  const id = record.documentId || record.key;
  const link = `${VERIFY_URL || 'https://verify.ask4prayers.com'}/?id=${encodeURIComponent(id)}`;
  await copyText(link);
  toast('Verification link copied', link);
}

function printRecord(key) {
  const record = getRecord(key);
  if (!record) return;
  window.open(`print.html?id=${encodeURIComponent(record.documentId || record.key)}`, '_blank', 'noopener');
}

async function openHistoryDialog(key) {
  const record = getRecord(key);
  if (!record) return;
  const documentId = record.documentId || key;
  $('historyDialogTitle').textContent = documentId;
  $('historyDialogBody').innerHTML = '<p class="field-help">Loading document history…</p>';
  openDialog('historyDialog');

  const rows = [];
  try {
    const snapshot = await api.getDocs(api.collection(db, 'documentHistory'));
    snapshot.forEach((item) => {
      const data = item.data();
      if (data.documentId === documentId) rows.push({ key: item.id, ...data });
    });
  } catch (error) {
    console.warn('Could not load document history.', error);
  }
  rows.sort((a, b) => dateNumber(b.createdAt) - dateNumber(a.createdAt));
  const auditRows = state.audits.filter((audit) => JSON.stringify(audit.details || {}).includes(documentId));
  const combined = [...rows, ...auditRows.map((audit) => ({ action: audit.action, actor: audit.actor, details: audit.details, createdAt: audit.createdAt }))]
    .sort((a, b) => dateNumber(b.createdAt) - dateNumber(a.createdAt));

  $('historyDialogBody').innerHTML = combined.length
    ? combined.map((row) => `<article class="timeline-item"><span class="timeline-dot"></span><div class="timeline-copy"><strong>${escapeHtml(titleCase(String(row.action || 'activity').replaceAll('_', ' ')))}</strong><small>${escapeHtml(formatDateTime(row.createdAt))} · ${escapeHtml(row.actor || 'system')}</small><p>${escapeHtml(formatDetails(row.details))}</p></div></article>`).join('')
    : '<p class="field-help">No history events are available for this record yet.</p>';
}

async function writeHistory(documentId, action, details) {
  const id = `${documentId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await api.setDoc(api.doc(db, 'documentHistory', id), {
      documentId,
      action,
      details,
      actor: state.user?.email || 'admin',
      createdAt: api.serverTimestamp()
    });
  } catch (error) {
    console.warn('Could not write document history.', error);
  }
}

async function updateRequestStatus(key, status) {
  await api.updateDoc(api.doc(db, 'verificationRequests', key), { status, updatedAt: api.serverTimestamp() });
  await writeAuditLog('verification_request_status_changed', { requestId: key, status }, state.user?.email || 'admin');
  await refreshData(false);
  toast('Request updated', `The request is now marked ${titleCase(status)}.`);
}

async function copyTemplate(id) {
  const template = templates.find((item) => item.id === id);
  if (!template) return;
  await copyText(template.description);
  toast('Template copied', `${template.title} is ready to paste.`);
}

function calculateFormHours() {
  const startDate = value('fieldStartDate');
  const endDate = value('fieldEndDate');
  const startTime = value('fieldStartTime');
  const endTime = value('fieldEndTime');
  if (!startDate || !endDate || !startTime || !endTime) {
    toast('Time information is incomplete', 'Enter both dates and both times before calculating hours.', 'error');
    return;
  }
  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  if (end <= start && startDate === endDate) end.setDate(end.getDate() + 1);
  if (end <= start) {
    toast('Invalid service range', 'The end date and time must be after the start date and time.', 'error');
    return;
  }
  const hours = Math.round(((end - start) / 3600000) * 100) / 100;
  if (!Number.isFinite(hours) || hours <= 0) {
    toast('Could not calculate hours', 'Review the service dates and times.', 'error');
    return;
  }
  $('fieldHours').value = hours;
  toast('Hours calculated', `${hours} verified hour${hours === 1 ? '' : 's'}.`);
}

function exportRecords() {
  const rows = state.records.map((record) => ({
    documentId: record.documentId || record.key,
    volunteerName: record.volunteerName || '',
    email: record.email || '',
    phone: record.phone || '',
    positionRole: record.positionRole || '',
    totalHours: record.totalHours || '',
    startDate: record.startDate || '',
    endDate: record.endDate || '',
    issuedOn: record.issuedOn || '',
    validUntil: record.validUntil || '',
    status: record.status || 'Active'
  }));
  downloadCsv('tpp-verification-records.csv', rows);
}

function exportAudits() {
  const rows = state.audits.map((audit) => ({
    action: audit.action || '',
    actor: audit.actor || '',
    createdAt: formatDateTime(audit.createdAt),
    details: JSON.stringify(audit.details || {})
  }));
  downloadCsv('tpp-verification-audit.csv', rows);
}

function exportRequests() {
  const rows = state.requests.map((request) => ({
    requestId: request.key,
    documentId: request.documentId || '',
    requesterEmail: request.requesterEmail || request.email || '',
    message: request.message || '',
    status: request.status || 'open',
    createdAt: formatDateTime(request.createdAt),
    updatedAt: formatDateTime(request.updatedAt)
  }));
  downloadCsv('tpp-verification-requests.csv', rows);
}

function downloadCsv(filename, rows) {
  if (!rows.length) {
    toast('Nothing to export', 'No rows are available for this report.', 'error');
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('CSV downloaded', filename);
}

function rerenderWithFocus(id, renderer, caret = null) {
  renderer();
  requestAnimationFrame(() => {
    const input = $(id);
    if (!input) return;
    input.focus();
    if (caret !== null && typeof input.setSelectionRange === 'function') input.setSelectionRange(caret, caret);
  });
}

function getMetrics() {
  const active = state.records.filter((record) => normalize(record.status || 'Active') === 'active').length;
  const inactive = state.records.length - active;
  const archived = state.records.filter((record) => normalize(record.status) === 'archived').length;
  const openRequests = state.requests.filter((request) => normalize(request.status || 'open') !== 'closed').length;
  const expiringSoon = state.records.filter((record) => {
    if (normalize(record.status || 'Active') !== 'active') return false;
    const end = new Date(record.validUntil || record.endDate || '');
    if (Number.isNaN(end.getTime())) return false;
    const days = (end - new Date()) / 86400000;
    return days >= 0 && days <= 30;
  }).length;
  return {
    total: state.records.length,
    active,
    inactive,
    archived,
    openRequests,
    expiringSoon,
    activeRate: state.records.length ? Math.round((active / state.records.length) * 100) : 0
  };
}

function countByStatus(records) {
  const counts = {};
  records.forEach((record) => {
    const status = record.status || 'Active';
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function getRecord(key) {
  return state.records.find((record) => record.key === key || record.documentId === key);
}

function value(id) {
  return $(id)?.value?.trim() || '';
}

function statusOptions(selected = 'Active', includeBlank = false) {
  const statuses = ['Active', 'Under Review', 'Expired', 'Superseded', 'Revoked', 'Archived'];
  return `${includeBlank ? '' : ''}${statuses.map((status) => `<option value="${status}" ${normalize(selected) === normalize(status) ? 'selected' : ''}>${status}</option>`).join('')}`;
}

function publicMessage(status) {
  const messages = {
    Active: 'This document is listed as active in the official records of The Prayer Project.',
    Expired: 'This document exists, but it is past its active verification period.',
    Superseded: 'This document exists, but a newer confirmation may have replaced it.',
    Revoked: 'This document exists, but it is no longer active for public verification.',
    Archived: 'This document is archived and is no longer active for public verification.',
    'Under Review': 'This document exists, but its current status is under administrative review.'
  };
  return messages[status] || 'This document exists, but its current status requires confirmation from The Prayer Project.';
}

function recordYear(record) {
  const date = parseDate(record.issuedOn || record.createdAt || record.startDate);
  return date ? String(date.getFullYear()) : '';
}

function formatHours(value) {
  const number = Number(value || 0);
  return `${Number.isFinite(number) ? number : 0} hr${number === 1 ? '' : 's'}`;
}

function formatDate(valueToFormat) {
  const date = parseDate(valueToFormat);
  if (!date) return 'Not listed';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(valueToFormat) {
  const date = parseDate(valueToFormat);
  if (!date) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function parseDate(input) {
  if (!input) return null;
  if (typeof input?.toDate === 'function') return input.toDate();
  if (input?.seconds) return new Date(input.seconds * 1000);
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateNumber(input) {
  return parseDate(input)?.getTime() || 0;
}

function toInputDate(input) {
  if (!input) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input))) return String(input);
  const date = parseDate(input);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusClass(status) {
  return normalize(status).replace(/\s+/g, '-');
}

function normalize(input) {
  return String(input || '').trim().toLowerCase();
}

function titleCase(input) {
  return String(input || '').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(input) {
  const parts = String(input || 'Administrator').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'A').toUpperCase();
}

function formatDetails(details) {
  if (!details || !Object.keys(details).length) return 'No additional details.';
  return Object.entries(details).map(([key, detail]) => `${titleCase(key.replaceAll('_', ' '))}: ${String(detail)}`).join(' · ');
}

function csvCell(valueToEscape) {
  return `"${String(valueToEscape ?? '').replaceAll('"', '""')}"`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function toast(title, message, type = 'success') {
  const item = document.createElement('article');
  item.className = `toast${type === 'error' ? ' error' : ''}`;
  item.innerHTML = `<span class="toast-icon">${type === 'error' ? '!' : '✓'}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  $('toastRegion').appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

function friendlyError(error, fallback) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'The email or password is incorrect.';
  if (code.includes('too-many-requests')) return 'Too many sign-in attempts. Wait briefly and try again.';
  if (code.includes('permission-denied')) return 'Firestore denied this action. Review the published security rules.';
  return error?.message && !String(error.message).includes('Firebase') ? error.message : fallback;
}

function escapeHtml(input = '') {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(input = '') {
  return escapeHtml(input).replaceAll('`', '&#096;');
}
