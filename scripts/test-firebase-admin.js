// Test script for Firebase Admin SDK
const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
require('dotenv').config({ path: '.env.local' });

async function testFirebaseAdmin() {
  try {
    console.log('Testing Firebase Admin SDK...');
    
    // Check environment variables
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    console.log('Bucket name:', bucketName);
    
    if (!bucketName) {
      throw new Error('FIREBASE_STORAGE_BUCKET is not defined');
    }
    
    // Initialize Firebase Admin
    const app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: bucketName,
    });
    
    console.log('Firebase Admin initialized successfully');
    
    // Test Storage
    const storage = getStorage();
    const bucket = storage.bucket(bucketName);
    
    // Check if bucket exists
    const [exists] = await bucket.exists();
    console.log('Bucket exists:', exists);
    
    if (exists) {
      console.log('Firebase Admin SDK is working correctly!');
    } else {
      console.error('Bucket does not exist. Please check your Firebase project settings.');
    }
  } catch (error) {
    console.error('Error testing Firebase Admin SDK:', error);
  }
}

testFirebaseAdmin(); 