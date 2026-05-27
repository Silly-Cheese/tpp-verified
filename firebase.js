import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, where } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

export const firebaseConfig = { apiKey:"AIzaSyBuSff9JvSmY0N-FgHYIK12hO6ulWjvrnI", authDomain:"verify-tpp.firebaseapp.com", projectId:"verify-tpp", storageBucket:"verify-tpp.firebasestorage.app", messagingSenderId:"1090804856735", appId:"1:1090804856735:web:70cb9fdb6f8ba03e08efaa" };

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const COLLECTIONS = { confirmations:"volunteerConfirmations", admins:"admins", auditLogs:"auditLogs", system:"system" };
export const OFFICIAL_ADMIN_EMAIL = "pray@ask4prayers.com";
export const VERIFY_URL = "https://verify.ask4prayers.com";

export const api = { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, limit, where, signInWithEmailAndPassword, signOut, onAuthStateChanged };

export function normalizeDocumentId(value){ return String(value||"").trim().toUpperCase().replace(/\s+/g,"-"); }
export function generateDocumentId(){ return `TPP-${Math.random().toString(36).slice(2,8).toUpperCase()}`; }

export async function initializeSystem(){
 const systemRef=doc(db,COLLECTIONS.system,"portal");
 if(!(await getDoc(systemRef)).exists()) await setDoc(systemRef,{name:"The Prayer Project Verification Portal",officialEmail:OFFICIAL_ADMIN_EMAIL,verifyUrl:VERIFY_URL,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 const adminRef=doc(db,COLLECTIONS.admins,OFFICIAL_ADMIN_EMAIL);
 if(!(await getDoc(adminRef)).exists()) await setDoc(adminRef,{email:OFFICIAL_ADMIN_EMAIL,role:"Founder & Director",name:"Christopher Shelley",active:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
}

export async function isAuthorizedAdmin(email){ return String(email||"").toLowerCase()===OFFICIAL_ADMIN_EMAIL; }

export async function writeAuditLog(action,details={},actor="system"){
 const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
 await setDoc(doc(db,COLLECTIONS.auditLogs,id),{action,details,actor,createdAt:serverTimestamp()});
}