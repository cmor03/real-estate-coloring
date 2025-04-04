import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getStorage, ref, getMetadata } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Add debug logging
console.log('Client-side Firebase config:', {
  ...firebaseConfig,
  apiKey: '[REDACTED]',
  appId: '[REDACTED]'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const storage = getStorage(app);

// Test storage access
if (typeof window !== 'undefined') {
  console.log('Testing client-side storage access...');
  const testRef = ref(storage, 'test.txt');
  getMetadata(testRef)
    .then(() => console.log('Client-side storage access successful'))
    .catch(err => console.error('Client-side storage access error:', err));
}

// Initialize Firestore with persistence
let firestore;
if (typeof window !== 'undefined') {
  firestore = getFirestore(app);
  
  // Enable persistence before any other Firestore operations
  enableIndexedDbPersistence(firestore).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.warn('The current browser does not support persistence.');
    } else {
      console.error('Error enabling persistence:', err);
    }
  });

  // Enable network by default
  enableNetwork(firestore).catch(console.error);

  // Monitor network status
  window.addEventListener('online', () => {
    console.log('Browser is online, enabling Firestore network');
    enableNetwork(firestore).catch(console.error);
  });

  window.addEventListener('offline', () => {
    console.log('Browser is offline, disabling Firestore network');
    disableNetwork(firestore).catch(console.error);
  });
} else {
  firestore = getFirestore(app);
}

export { firestore };
export default app;
