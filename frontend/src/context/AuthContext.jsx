import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to Firebase auth state once on mount.
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // --- Auth actions ---
  const requireAuth = () => {
    if (!auth) throw new Error("Firebase auth is not initialized.");
    return auth;
  };

  const signIn = async (email, password) => {
    const credential = await signInWithEmailAndPassword(
      requireAuth(),
      email,
      password
    );
    setCurrentUser(credential.user);
    return credential;
  };

  const signUp = async (email, password) => {
    const credential = await createUserWithEmailAndPassword(
      requireAuth(),
      email,
      password
    );
    setCurrentUser(credential.user);
    return credential;
  };

  const logout = async () => {
    await signOut(requireAuth());
    setCurrentUser(null);
  };

  /**
   * Retrieve the active user's Firebase JWT.
   * Used for `Authorization: Bearer <token>` headers and the WS `?token=` param.
   */
  const getToken = async () => {
    if (!auth.currentUser) throw new Error("No authenticated user.");
    return auth.currentUser.getIdToken();
  };

  const value = {
    currentUser,
    loading,
    signIn,
    signUp,
    logout,
    getToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
