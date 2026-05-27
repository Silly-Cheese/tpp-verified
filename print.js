import { db, COLLECTIONS, api } from './firebase.js';

const params = new URLSearchParams(window.location.search);
const recordId = params.get('id');

if (!recordId) {
  document.body.innerHTML = '<h1 style="font-family:Arial;padding:40px">No Document ID Provided</h1>';
  throw new Error('Missing document ID');
}

function setField(fieldId, value) {
  const element = document.getElementById(fieldId);
  if (element) {
    element.textContent = value || 'Not Listed';
  }
}

async function loadRecord() {
  const reference = api.doc(db, COLLECTIONS.confirmations, recordId);
  const snapshot = await api.getDoc(reference);

  if (!snapshot.exists()) {
    document.body.innerHTML = '<h1 style="font-family:Arial;padding:40px">Verification Record Not Found</h1>';
    return;
  }

  const data = snapshot.data();

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

  document.title = `${data.documentId} - Volunteer Confirmation`;
}

loadRecord();