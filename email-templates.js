import { db, COLLECTIONS, api } from './firebase.js';

const form = document.getElementById('templateForm');
const templateArea = document.getElementById('templateArea');
const volunteerTemplate = document.getElementById('volunteerTemplate');
const reviewerTemplate = document.getElementById('reviewerTemplate');

async function loadTemplates(id) {
  const reference = api.doc(db, COLLECTIONS.confirmations, id);
  const snapshot = await api.getDoc(reference);

  if (!snapshot.exists()) {
    window.alert('Verification record not found.');
    return;
  }

  const d = snapshot.data();

  volunteerTemplate.value = `Subject: The Prayer Project Volunteer Hour Confirmation\n\nHello ${d.volunteerName || 'Volunteer'},\n\nThank you for serving with The Prayer Project. This message confirms that your volunteer verification record has been created successfully.\n\nVolunteer Name: ${d.volunteerName || ''}\nDocument ID: ${d.documentId || ''}\nTotal Verified Hours: ${d.totalHours || ''}\nService Dates: ${d.startDate || ''} through ${d.endDate || ''}\nPosition / Role: ${d.positionRole || ''}\n\nYour volunteer verification may be reviewed at:\nhttps://verify.ask4prayers.com\n\nPlease enter your Document ID exactly as shown above.\n\nOfficial Contact:\npray@ask4prayers.com\n\nWith gratitude,\n\nChristopher Shelley\nFounder & Director\nThe Prayer Project`;

  reviewerTemplate.value = `Subject: Volunteer Hour Verification Response\n\nHello,\n\nThis message is in response to a request for volunteer verification through The Prayer Project.\n\nThe following volunteer verification record is currently listed as ${d.status || 'Active'} within our official system:\n\nVolunteer Name: ${d.volunteerName || ''}\nDocument ID: ${d.documentId || ''}\nTotal Verified Hours: ${d.totalHours || ''}\nService Dates: ${d.startDate || ''} through ${d.endDate || ''}\nPosition / Role: ${d.positionRole || ''}\n\nThis record may also be independently reviewed at:\nhttps://verify.ask4prayers.com\n\nOfficial Contact:\npray@ask4prayers.com\n\nSincerely,\n\nChristopher Shelley\nFounder & Director\nThe Prayer Project`;

  templateArea.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.getElementById('documentId').value.trim();
  await loadTemplates(id);
});

async function copyText(element) {
  await navigator.clipboard.writeText(element.value);
}

document.getElementById('copyVolunteer').addEventListener('click', async () => {
  await copyText(volunteerTemplate);
  window.alert('Volunteer email copied.');
});

document.getElementById('copyReviewer').addEventListener('click', async () => {
  await copyText(reviewerTemplate);
  window.alert('Reviewer email copied.');
});