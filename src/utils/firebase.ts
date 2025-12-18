import {initializeApp} from 'firebase/app';
import {getFirestore, Timestamp} from 'firebase/firestore';

// TODO: Replace with your Firebase configuration
// Get these values from your Firebase project settings
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Export Timestamp for use in components
export {Timestamp};

export default app;

