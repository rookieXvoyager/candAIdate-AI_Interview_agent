// Firebase Web SDK initialization.
// Values are read from Vite env vars (see .env.example). These are public web keys.
import { initializeApp } from "firebase/app";
// ADDED: Social Auth Providers
import { getAuth, GoogleAuthProvider, GithubAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseEnv =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "your-api-key" &&
  !!firebaseConfig.projectId &&
  firebaseConfig.projectId !== "your-project-id";

export let firebaseInitError = null;
export let auth = null;
export let db = null;
let app = null;

if (hasFirebaseEnv) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    firebaseInitError = error;
    console.error("Firebase initialization failed:", error);
  }
}

// OAuth provider configuration.
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");
googleProvider.setCustomParameters({ prompt: "select_account" });

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");
githubProvider.addScope("user:email");

export const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.addScope("email");
microsoftProvider.addScope("profile");
microsoftProvider.addScope("openid");
microsoftProvider.setCustomParameters({ prompt: "select_account" });

// True only when real values are present and Firebase auth initialized cleanly.
export const isFirebaseConfigured = hasFirebaseEnv && !firebaseInitError && !!auth;
export default app;