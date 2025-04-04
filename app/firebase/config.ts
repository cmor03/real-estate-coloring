import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, doc, getDoc, setDoc, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase app
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Initialize Firestore with persistent cache
let db: Firestore;
try {
  // Try to get existing Firestore instance
  db = getFirestore(app);
} catch {
  // If it doesn't exist, initialize it with our settings
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({})
    })
  });
}

// Function to ensure user document exists
export const ensureUserDocument = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    // Create user document if it doesn't exist
    await setDoc(userRef, {
      email: auth.currentUser?.email || '',
      credits: 0, // Start with 0 credits
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Created new user document for:', userId);
  }
  
  return userDoc.exists();
};

export { app, auth, db }; 