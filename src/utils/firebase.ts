import {initializeApp} from 'firebase/app';
import {getFirestore, Timestamp} from 'firebase/firestore';

// TODO: Replace with your Firebase configuration
// Get these values from your Firebase project settings
const firebaseConfig = {
  apiKey: "AIzaSyApj6QD4ccBcf2Wy7U0ftNniFwckb_owo0",
  authDomain: "chatonly-db137.firebaseapp.com",
  databaseURL: "https://chatonly-db137-default-rtdb.firebaseio.com",
  projectId: "chatonly-db137",
  storageBucket: "chatonly-db137.firebasestorage.app",
  messagingSenderId: "850049908643",
  appId: "1:850049908643:web:1fd0c039470c295a256416",
  measurementId: "G-WEHNW1EM7Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Export Timestamp for use in components
export {Timestamp};

export default app;

