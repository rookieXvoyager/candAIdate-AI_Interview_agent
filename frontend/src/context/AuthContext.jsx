import { createContext, useContext, useEffect, useState } from "react";
import {
  fetchSignInMethodsForEmail,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  auth,
  googleProvider,
  githubProvider,
  microsoftProvider,
  isFirebaseConfigured,
} from "../firebase";

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

    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) setCurrentUser(result.user);
      })
      .catch((error) => {
        if (error?.code) console.error("OAuth redirect fallback failed:", error);
      });

    return () => unsubscribe();
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

  const signInWithProvider = async (providerName) => {
    const provider =
      providerName === "google"
        ? googleProvider
        : providerName === "github"
          ? githubProvider
          : providerName === "microsoft"
            ? microsoftProvider
            : null;

    if (!provider) throw new Error("Unsupported OAuth provider.");

    try {
      const credential = await signInWithPopup(requireAuth(), provider);
      setCurrentUser(credential.user);
      return credential;
    } catch (error) {
      if (error?.code === "auth/account-exists-with-different-credential") {
        try {
          const conflictingEmail =
            error.customData?.email ||
            error.customData?._tokenResponse?.email ||
            "";
          if (!conflictingEmail) throw new Error("No conflicting email returned");

          const methods = await fetchSignInMethodsForEmail(
            requireAuth(),
            conflictingEmail
          );
          const labels = methods.map((method) => {
            if (method === "google.com") return "Google";
            if (method === "github.com") return "GitHub";
            if (method === "microsoft.com") return "Microsoft";
            if (method === "password") return "email/password";
            return method;
          });
          error.friendlyMessage =
            labels.length > 0
              ? `This email is already registered with ${labels.join(" or ")}. Sign in with that method first.`
              : "This email is already registered with a different sign-in method.";
        } catch {
          error.friendlyMessage =
            "This email is already registered with a different sign-in method.";
        }
      }
      throw error;
    }
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
    signInWithProvider,
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
