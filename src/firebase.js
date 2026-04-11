import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD05d4utxXVNERu_8MAPG_pHLfkMn2me6s",
  authDomain: "gtagarage-e4fae.firebaseapp.com",
  projectId: "gtagarage-e4fae",
  storageBucket: "gtagarage-e4fae.firebasestorage.app",
  messagingSenderId: "969035839048",
  appId: "1:969035839048:web:338d581714a51b93abca7d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
