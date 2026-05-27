import { auth, provider, db, COLLECTIONS, api, initializeSystem, isAuthorizedAdmin, generateDocumentId, writeAuditLog, OFFICIAL_ADMIN_EMAIL } from './firebase.js';

await initializeSystem();

provider.setCustomParameters({ prompt:'select_account' });

const loginBtn=document.getElementById('loginBtn');
const logoutBtn=document.getElementById('logoutBtn');
const adminContent=document.getElementById('adminContent');
const authMessage=document.getElementById('authMessage');
const form=document.getElementById('recordForm');
const records=document.getElementById('records');
const refreshBtn=document.getElementById('refreshBtn');
const totalRecords=document.getElementById('totalRecords');
const activeRecords=document.getElementById('activeRecords');

let currentUser=null;

async function showDashboard(user){
  currentUser=user;
  adminContent.hidden=false;
  loginBtn.hidden=true;
  logoutBtn.hidden=false;
  authMessage.textContent='Authenticated as '+user.email;
  await loadRecords();
}

async function loadRecords(){
  records.innerHTML='<div class="record">Loading records...</div>';
  const snap=await api.getDocs(api.collection(db,COLLECTIONS.confirmations));
  records.innerHTML='';

  let total=0;
  let active=0;

  snap.forEach(docSnap=>{
    total++;
    const d=docSnap.data();
    if((d.status||'Active')==='Active') active++;

    const div=document.createElement('div');
    div.className='record';
    div.innerHTML='\n      <div class="record-top">\n        <div>\n          <div class="record-id">'+d.documentId+'</div>\n          <h3>'+d.volunteerName+'</h3>\n          <p>'+d.positionRole+'</p>\n        </div>\n        <div>\n          <strong>'+d.totalHours+' Hours</strong><br>\n          '+(d.status||'Active')+'\n        </div>\n      </div>\n      <p><strong>Service Dates:</strong> '+(d.startDate||'Not listed')+' through '+(d.endDate||'Not listed')+'</p>\n      <p><strong>Issued:</strong> '+(d.issuedOn||'Not listed')+'</p>\n    ';

    records.appendChild(div);
  });

  totalRecords.textContent=total;
  activeRecords.textContent=active;
}

loginBtn.addEventListener('click',async()=>{
  try{
    const result=await api.signInWithPopup(auth,provider);
    const email=(result.user.email||'').toLowerCase();

    if(!(await isAuthorizedAdmin(email))){
      authMessage.textContent='This Google account is not authorized for administrator access.';
      await api.signOut(auth);
      return;
    }

    await writeAuditLog('admin_login',{email},email);
    await showDashboard(result.user);

  }catch(err){
    console.error(err);
    authMessage.textContent='Authentication failed. Ensure Google Authentication is enabled in Firebase and this domain is listed as an authorized domain.';
  }
});

logoutBtn.addEventListener('click',async()=>{
  await api.signOut(auth);
  location.reload();
});

refreshBtn.addEventListener('click',loadRecords);

api.onAuthStateChanged(auth,async(user)=>{
  if(!user) return;

  const email=(user.email||'').toLowerCase();
  if(await isAuthorizedAdmin(email)){
    await showDashboard(user);
  }
});

form.addEventListener('submit',async e=>{
  e.preventDefault();

  const id=generateDocumentId();

  const data={
    documentId:id,
    volunteerName:document.getElementById('volunteerName').value,
    age:document.getElementById('age').value,
    email:document.getElementById('email').value,
    phone:document.getElementById('phone').value,
    positionRole:document.getElementById('positionRole').value,
    duties:document.getElementById('duties').value,
    startDate:document.getElementById('startDate').value,
    endDate:document.getElementById('endDate').value,
    totalHours:document.getElementById('totalHours').value,
    issuedOn:new Date().toLocaleDateString(),
    verifiedBy:'Christopher Shelley',
    verifiedByEmail:OFFICIAL_ADMIN_EMAIL,
    status:'Active',
    createdAt:api.serverTimestamp(),
    updatedAt:api.serverTimestamp()
  };

  await api.setDoc(api.doc(db,COLLECTIONS.confirmations,id),data);

  await writeAuditLog('record_created',{documentId:id},currentUser.email);

  form.reset();
  await loadRecords();

  alert('Verification record created successfully. Document ID: '+id);
});