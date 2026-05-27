import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAuLIFRS74DwAd4VyF5aD9faZwzQ8RD3vY",
  authDomain: "study-tracker-7c01b.firebaseapp.com",
  projectId: "study-tracker-7c01b",
  storageBucket: "study-tracker-7c01b.firebasestorage.app",
  messagingSenderId: "57717713333",
  appId: "1:57717713333:web:18137b94b418d3b23991fc",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);