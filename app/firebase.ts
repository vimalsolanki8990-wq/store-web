import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCH7jxfxrzgf3aV4w2xnyK6-WPS_L3yt9g",
  authDomain: "vachhraj-store.firebaseapp.com",
  projectId: "vachhraj-store",
  storageBucket: "vachhraj-store.firebasestorage.app",
  messagingSenderId: "662269421695",
  appId: "1:662269421695:web:1fd6ddd740c3201f74374a",
  measurementId: "G-JXMFYELEYG",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });