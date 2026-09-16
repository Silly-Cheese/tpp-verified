import { db, COLLECTIONS, api, normalizeDocumentId, VERIFY_URL } from './firebase.js';
const $ = id => document.getElementById(id);
let loading = false;
function show(message) { $('feedback').textContent = message; }
function display(value) { return value === undefined || value === null || value === '' ? 'Not listed' : String(value); }
function statusFor(d) {
  const status = String(d.status || 'Active').trim();
  const expires = d.validUntil || d.expiresAt;
  if (status.toLowerCase() === 'active' && expires && new Date(expires) < new Date()) return 'Expired';
  return status;
}
$('templateForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (loading) return;
  const id = normalizeDocumentId($('documentId').value);
  if (!id || id.includes('/')) { show('Enter a valid document ID.'); return; }
  loading = true;
  $('loadButton').disabled = true;
  $('loadButton').textContent = 'Loading…';
  $('templateArea').hidden = true;
  show('Loading the verification record…');
  try {
    const snapshot = await api.getDoc(api.doc(db, COLLECTIONS.confirmations, id));
    if (!snapshot.exists()) { show('No record found. Check the ID and try again.'); return; }
    const d = snapshot.data();
    const recordId = d.documentId || id;
    const name = display(d.volunteerName);
    const status = statusFor(d);
    const active = status.toLowerCase() === 'active';
    const link = (VERIFY_URL || 'https://verify.ask4prayers.com') + '/?id=' + encodeURIComponent(recordId);
    const dates = d.startDate && d.endDate ? (d.startDate === d.endDate ? d.startDate : d.startDate + ' through ' + d.endDate) : display(d.startDate || d.endDate);
    const details = [
      'Volunteer: ' + name,
      'Document ID: ' + recordId,
      'Service hours recorded: ' + display(d.totalHours),
      'Service dates: ' + dates,
      'Role: ' + display(d.positionRole || 'Volunteer'),
      'Current record status: ' + status
    ].join('\n');
    const signature = 'Christopher Shelley\nFounder & Director\nThe Prayer Project\npray@ask4prayers.com';
    const caution = active
      ? 'The record is currently active. Please check the online result for its latest status.'
      : 'This record is not currently active. It should not be accepted as an active service confirmation. Please contact us if you need clarification.';
    $('volunteerSubject').value = (active ? 'Your volunteer service record' : 'Volunteer service record update') + ' | The Prayer Project | ' + recordId;
    $('reviewerSubject').value = 'Volunteer service verification: ' + name + ' | ' + recordId;
    $('volunteerTemplate').value = 'Hello ' + (d.volunteerName || 'there') + ',\n\nThank you for giving your time to The Prayer Project. Here are the details of your volunteer service record.\n\n' + details + '\n\nView your record:\n' + link + '\n\n' + caution + '\n\nIf you need a printed confirmation, please contact us for a copy signed and dated by an authorized representative. The form includes a QR code linking to the online record; the QR code does not replace the handwritten signature.\n\nIf any details look incorrect, reply with your document ID so we can review them.\n\nWith gratitude,\n' + signature;
    $('reviewerTemplate').value = 'Hello,\n\nThe following volunteer service information is recorded with The Prayer Project.\n\n' + details + '\n\nVerify this record directly:\n' + link + '\n\n' + caution + '\n\nIf you are reviewing a printed confirmation, compare its details with the online record and check that the authorized signature and date-signed fields have been completed by hand. The QR code on the form opens the same verification record.\n\nFor questions or discrepancies, reply to this email or contact pray@ask4prayers.com and include the document ID.\n\nSincerely,\n' + signature;
    $('recordName').textContent = name;
    $('recordMeta').textContent = recordId + ' · ' + status + ' · ' + display(d.totalHours) + ' hours';
    $('printRecord').href = 'print.html?id=' + encodeURIComponent(recordId);
    $('templateArea').hidden = false;
    show('Drafts ready. Review the record status and message before copying.');
  } catch (error) {
    console.error('Template lookup failed', error);
    show('Unable to load this record. Check your connection and admin sign-in, then try again.');
  } finally {
    loading = false; $('loadButton').disabled = false; $('loadButton').textContent = 'Load record';
  }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy], [data-copy-all]');
  if (!button) return;
  const kind = button.dataset.copyAll;
  const source = kind ? $(kind + 'Template') : $(button.dataset.copy);
  const text = kind ? 'Subject: ' + $(kind + 'Subject').value + '\n\n' + source.value : source.value;
  try {
    await navigator.clipboard.writeText(text);
    show('Copied. Paste it into your email and review before sending.');
  } catch {
    source.focus(); source.select();
    show('Clipboard access is unavailable. The text is selected; use your device’s Copy command. Copy the subject separately if needed.');
  }
});
