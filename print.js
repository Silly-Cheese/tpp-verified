import { db, COLLECTIONS, api, VERIFY_URL } from './firebase.js';

const params = new URLSearchParams(window.location.search);
const recordId = params.get('id');

if (!recordId) {
  document.body.innerHTML = '<h1 style="font-family:Arial;padding:40px">No Document ID Provided</h1>';
  throw new Error('Missing document ID');
}

function setField(fieldId, value) {
  const element = document.getElementById(fieldId);
  if (element) element.textContent = value || 'Not Listed';
}

function checksum(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16).toUpperCase().slice(0, 4) + '-' + Math.abs(hash * 31).toString(16).toUpperCase().slice(0, 4);
}

async function loadRecord() {
  const reference = api.doc(db, COLLECTIONS.confirmations, recordId);
  const snapshot = await api.getDoc(reference);
  if (!snapshot.exists()) {
    document.body.innerHTML = '<h1 style="font-family:Arial;padding:40px">Verification Record Not Found</h1>';
    return;
  }
  const data = snapshot.data();
  const directLink = `${VERIFY_URL || 'https://verify.ask4prayers.com'}?id=${encodeURIComponent(data.documentId || recordId)}`;
  const hash = checksum((data.documentId || recordId) + (data.volunteerName || '') + (data.totalHours || ''));
  setField('volunteerName', data.volunteerName);
  setField('age', data.age);
  setField('email', data.email);
  setField('phone', data.phone);
  setField('positionRole', data.positionRole);
  setField('duties', data.duties);
  setField('serviceDates', `${data.startDate || ''} through ${data.endDate || ''}`);
  setField('serviceTime', `${data.serviceStartTime || ''} - ${data.serviceEndTime || ''}`);
  setField('totalHours', `${data.totalHours || ''} Hours`);
  setField('documentId', data.documentId);
  setField('status', data.status || 'Active');
  setField('issuedOn', data.issuedOn || new Date().toLocaleDateString());
  setField('checksum', hash);
  setField('verifyLink', directLink);
  const qr = document.getElementById('qrCode');
  if (qr) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(directLink)}`;
  document.getElementById('copyDocIdBtn')?.addEventListener('click', () => navigator.clipboard?.writeText(data.documentId || recordId));
  document.getElementById('copyVerifyBtn')?.addEventListener('click', () => navigator.clipboard?.writeText(directLink));
  document.title = `${data.documentId} - Volunteer Confirmation`;
}

loadRecord();