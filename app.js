import { db, COLLECTIONS, api, initializeSystem, normalizeDocumentId } from './firebase.js';
await initializeSystem();
const form=document.getElementById('verifyForm');
const input=document.getElementById('documentId');
const wrap=document.getElementById('resultWrap');
const card=document.getElementById('resultCard');
function clean(v){return String(v||'Not listed').replaceAll('<','').replaceAll('>','');}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const id=normalizeDocumentId(input.value);
 wrap.hidden=false;
 card.innerHTML='<h3>Checking official records...</h3>';
 const snap=await api.getDoc(api.doc(db,COLLECTIONS.confirmations,id));
 if(!snap.exists()){
  card.innerHTML='<h3 style="color:#991b1b">Document Not Found</h3><p>No verification record was found for this Document ID.</p><p>Please check the ID exactly as printed on the form or contact pray@ask4prayers.com.</p>';
  return;
 }
 const d=snap.data();
 const active=(d.status||'Active')==='Active';
 card.innerHTML='<h3 style="color:'+(active?'#166534':'#991b1b')+'">'+(active?'Valid Document':'Document Not Active')+'</h3>'+
 '<p>'+(active?'This volunteer confirmation is listed in the official records of The Prayer Project.':'This document exists, but it is not currently marked active.')+'</p>'+
 '<p><strong>Volunteer Name:</strong> '+clean(d.volunteerName)+'</p>'+
 '<p><strong>Age:</strong> '+clean(d.age)+'</p>'+
 '<p><strong>Position / Role:</strong> '+clean(d.positionRole)+'</p>'+
 '<p><strong>Duties:</strong> '+clean(d.duties)+'</p>'+
 '<p><strong>Service Dates:</strong> '+clean(d.startDate)+' through '+clean(d.endDate)+'</p>'+
 '<p><strong>Total Verified Hours:</strong> '+clean(d.totalHours)+'</p>'+
 '<p><strong>Issued On:</strong> '+clean(d.issuedOn)+'</p>'+
 '<p><strong>Verified By:</strong> '+clean(d.verifiedBy)+'</p>'+
 '<p><strong>Document ID:</strong> '+clean(d.documentId)+'</p>'+
 '<p><strong>Status:</strong> '+clean(d.status||'Active')+'</p>';
});
