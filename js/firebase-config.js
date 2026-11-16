// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 1. AyurParam Panchakarma Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyBrqyYZCDJMIcZ_Yp5dJeIMQ3GVotMLCpI",
  authDomain: "ayurparam-panchakarma.firebaseapp.com",
  projectId: "ayurparam-panchakarma",
  storageBucket: "ayurparam-panchakarma.firebasestorage.app",
  messagingSenderId: "76014345943",
  appId: "1:76014345943:web:96cc9c9290f95892971a92",
  measurementId: "G-EZT97K5LDJ"
};

// 2. Super Admin / Main Doctor Fixed Gmail IDs
export const SUPER_ADMIN_EMAILS = [
  "batch22pk@gmail.com",
  "office8ang@gmail.com"
].map(e => e.toLowerCase().trim());

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// OPD/IPD वार्ड में नेटवर्क कमजोर होने पर भी डेटा सेव रखने के लिए Offline Persistence
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
};