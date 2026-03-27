import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const isConfigValid = !!firebaseConfig.apiKey;

// Initialize Firebase only if config is valid or during client-side execution with env vars
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize services with safety checks for build-time (SSR/Prerendering)
let auth: any;
let db: any;
let storage: any;

const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)";

if (isConfigValid) {
  auth = getAuth(app);
  db = getFirestore(app, databaseId);
  storage = getStorage(app);
} else {
  console.warn("Firebase configuration is missing. This might be normal during build-time (prerendering).");
}

export { app, auth, db, storage };
