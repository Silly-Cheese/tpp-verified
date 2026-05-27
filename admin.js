import { auth, db, COLLECTIONS, api, isAuthorizedAdmin, generateDocumentId, writeAuditLog, OFFICIAL_ADMIN_EMAIL } from './firebase.js';

const loginCard = document.getElementById('loginCard');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminContent = document.getElementById('adminContent');
const authMessage = document.getElementById('authMessage');
const form = document.getElementById('recordForm');
const records = document.getElementById('records');
const refreshBtn = document.getElementById('refreshBtn');
const totalRecords = document.getElementById('totalRecords');
const activeRecords = document.getElementById('activeRecords');
const invalidRecords = document.getElementById('invalidRecords');
const searchRecords = document.getElementById('searchRecords');
const editingId = document.getElementById('editingId');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

let currentUser = null;
let cache = [];

function value(id) { return document.getElementById(id).value.trim(); }
function setValue(id, val) { document.getElementById(id).value = val || ''; }
function esc(v) { return String(v || '').replace(/[<>]/g, ''); }

function showDashboard(user) {
  currentUser = user;
  loginCard.hidden = true;
  adminContent.hidden = false;
  loadRecords();
}

async function loadRecords() {
  records.innerHTML = '<div class="record">Loading records...</div>';
  const snap = await api.getDocs(api.collection(db, COLLECTIONS.confirmations));
  cache = [];
  snap.forEach(s => cache.push({ id: s.id, ...s.data() }));
  cache.sort((a,b) => String(b.createdAt || b.issuedOn || '').localeCompare(String(a.createdAt || a.issuedOn || '')));
  renderRecords();
}

function renderRecords() {
  const term = (searchRecords.value || '').toLowerCase();
  const filtered = cache.filter(d => JSON.stringify(d).toLowerCase().includes(term));
  const active = cache.filter(d => (d.status || 'Active') === 'Active').length;
  const invalid = cache.filter(d => (d.status || 'Active') !== 'Active').length;
  totalRecords.textContent = cache.length;
  activeRecords.textContent = active;
  invalidRecords.textContent = invalid;

  if (!filtered.length) {
    records.innerHTML = '<div class="record">No records found.</div>';
    return;
  }

  records.innerHTML = '';
  filtered.forEach(d => {
    const div = document.createElement('div');
    div.className = 'record ' + ((d.status || 'Active') === 'Active' ? 'record-active' : 'record-invalid');
    div.innerHTML = '<div class="record-top"><div><div class="record-id">' + esc(d.documentId) + '</div><h3>' + esc(d.volunteerName) + '</h3><p>' + esc(d.positionRole || 'Volunteer') + '</p></div><div><strong>' + esc(d.totalHours) + ' Hours</strong><br><span class="mini-status">' + esc(d.status || 'Active') + '</span></div></div><p><strong>Age:</strong> ' + esc(d.age || 'Not listed') + '</p><p><strong>Service Dates:</strong> ' + esc(d.startDate || 'Not listed') + ' through ' + esc(d.endDate || 'Not listed') + '</p><p><strong>Issued:</strong> ' + esc(d.issuedOn || 'Not listed') + '</p><div class="record-actions"><button data-action="edit" data-id="' + esc(d.documentId) + '">Edit</button><button data-action="toggle" data-id="' + esc(d.documentId) + '">' + ((d.status || 'Active') === 'Active' ? 'Mark Invalid' : 'Reactivate') + '</button><button data-action="delete" data-id="' + esc(d.documentId) + '" class="danger-btn">Delete</button></div>';
    records.appendChild(div);
  });
}

loginBtn.addEventListener('click', async () => {
  const email = prompt('Enter admin email:', 'pray@ask4prayers.com');
  if (!email) return;
  const password = prompt('Enter admin password:');
  if (!password) return;
  try {
    const result = await api.signInWithEmailAndPassword(auth, email, password);
    if (!(await isAuthorizedAdmin(result.user.email))) {
      authMessage.textContent = 'This account is not authorized.';
      await api.signOut(auth);
      return;
    }
    await writeAuditLog('admin_login', { email: result.user.email }, result.user.email);
    showDashboard(result.user);
  } catch (err) {
    console.error(err);
    authMessage.textContent = 'Authentication failed. Check the email, password, Email/Password Auth setting, and Firestore rules.';
  }
});

logoutBtn.addEventListener('click', async () => { await api.signOut(auth); location.reload(); });
refreshBtn.addEventListener('click', loadRecords);
searchRecords.addEventListener('input', renderRecords);
cancelEditBtn.addEventListener('click', () => { form.reset(); editingId.value = ''; formTitle.textContent = 'Create Record'; submitBtn.textContent = 'Create Record'; cancelEditBtn.hidden = true; });

records.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const rec = cache.find(r => r.documentId === id);
  if (!rec) return;

  if (action === 'edit') {
    editingId.value = rec.documentId;
    setValue('volunteerName', rec.volunteerName);
    setValue('age', rec.age);
    setValue('email', rec.email);
    setValue('phone', rec.phone);
    setValue('positionRole', rec.positionRole);
    setValue('duties', rec.duties);
    setValue('startDate', rec.startDate);
    setValue('endDate', rec.endDate);
    setValue('totalHours', rec.totalHours);
    formTitle.textContent = 'Edit Record';
    submitBtn.textContent = 'Save Changes';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (action === 'toggle') {
    const newStatus = (rec.status || 'Active') === 'Active' ? 'Invalid' : 'Active';
    await api.updateDoc(api.doc(db, COLLECTIONS.confirmations, id), { status: newStatus, updatedAt: api.serverTimestamp() });
    await writeAuditLog('record_status_changed', { documentId: id, status: newStatus }, currentUser.email);
    await loadRecords();
  }

  if (action === 'delete') {
    if (!confirm('Delete this verification record permanently?')) return;
    await api.deleteDoc(api.doc(db, COLLECTIONS.confirmations, id));
    await writeAuditLog('record_deleted', { documentId: id }, currentUser.email);
    await loadRecords();
  }
});

api.onAuthStateChanged(auth, async user => { if (user && await isAuthorizedAdmin(user.email)) showDashboard(user); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const existingId = editingId.value;
  const id = existingId || generateDocumentId();
  const data = {
    documentId: id,
    volunteerName: value('volunteerName'),
    age: value('age'),
    email: value('email'),
    phone: value('phone'),
    positionRole: value('positionRole'),
    duties: value('duties'),
    startDate: value('startDate'),
    endDate: value('endDate'),
    totalHours: value('totalHours'),
    issuedOn: existingId ? (cache.find(r => r.documentId === id)?.issuedOn || new Date().toLocaleDateString()) : new Date().toLocaleDateString(),
    verifiedBy: 'Christopher Shelley',
    verifiedByEmail: OFFICIAL_ADMIN_EMAIL,
    status: existingId ? (cache.find(r => r.documentId === id)?.status || 'Active') : 'Active',
    updatedAt: api.serverTimestamp()
  };
  if (!existingId) data.createdAt = api.serverTimestamp();
  await api.setDoc(api.doc(db, COLLECTIONS.confirmations, id), data, { merge: true });
  await writeAuditLog(existingId ? 'record_updated' : 'record_created', { documentId: id }, currentUser.email);
  form.reset(); editingId.value = ''; formTitle.textContent = 'Create Record'; submitBtn.textContent = 'Create Record'; cancelEditBtn.hidden = true;
  await loadRecords();
  alert((existingId ? 'Updated' : 'Created') + ' record successfully. Document ID: ' + id);
});
