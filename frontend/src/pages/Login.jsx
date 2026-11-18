import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, AlertTriangle, Check } from "lucide-react";
// ADDED: react-icons for social buttons
import { FaGoogle, FaGithub, FaMicrosoft } from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { 
  auth,
  firebaseInitError, 
  isFirebaseConfigured,
} from "../firebase";
import Spinner from "../components/Spinner";
import { LogoMark } from "../components/Logo";

// Maps raw Firebase error codes to friendly copy.
function friendlyError(code) {
  switch (code) {
    case "auth/missing-email":
      return "Please enter your email address.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completing.";
    case "auth/cancelled-popup-request":
      return "Sign-in was canceled. Please try again.";
    case "auth/popup-blocked":
      return "The sign-in popup was blocked. Allow popups for candaidate.app and try again.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorized for Firebase sign-in. Add candaidate.app in Firebase Authentication > Settings > Authorized domains.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with the same email address but different sign-in credentials.";
    case "auth/api-key-not-valid":
    case "auth/invalid-api-key":
      return "Firebase isn't configured. Paste your real keys into frontend/.env and restart the dev server.";
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return "Sign-in method isn't enabled. Turn it on in Firebase Console.";
    case "auth/network-request-failed":
      return "Network error reaching Firebase. Check your connection.";
    default:
      return "Authentication failed. Please check your setup and try again.";
  }
}

function firebaseSetupMessage() {
  if (!firebaseInitError) {
    return "Paste your web app keys into frontend/.env and restart the dev server.";
  }

  switch (firebaseInitError.code) {
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return "Firebase rejected the API key at runtime. Copy the Web app API key from the same Firebase project as this app, then restart Vite.";
    case "auth/configuration-not-found":
      return "Firebase Auth is not enabled for this project or the app config does not match the project. Check the Firebase console and your frontend/.env values.";
    default:
      return `Firebase initialization failed (${firebaseInitError.code || "unknown error"}). Check frontend/.env and restart the dev server.`;
  }
}

export default function Login() {
  const { currentUser, signIn, signUp, signInWithProvider } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeProvider, setActiveProvider] = useState(null);
  const recoveryTimerRef = useRef(null);

  const resetLoginState = () => {
    setBusy(false);
    setActiveProvider(null);
  };

  const isSignup = mode === "signup";

  // If already signed in, skip the login screen.
  useEffect(() => {
    if (currentUser) {
      resetLoginState();
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (!activeProvider) return undefined;

    const clearRecoveryTimer = () => {
      if (recoveryTimerRef.current) {
        window.clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
    };

    const recoverFromHungPopup = () => {
      clearRecoveryTimer();
      recoveryTimerRef.current = window.setTimeout(() => {
        if (!auth?.currentUser) {
          resetLoginState();
          setError("Sign-in canceled. Please try again.");
        }
      }, 1500);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") recoverFromHungPopup();
    };

    window.addEventListener("focus", recoverFromHungPopup);
    window.addEventListener("pageshow", recoverFromHungPopup);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearRecoveryTimer();
      window.removeEventListener("focus", recoverFromHungPopup);
      window.removeEventListener("pageshow", recoverFromHungPopup);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeProvider]);

  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current) {
        window.clearTimeout(recoveryTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(e.currentTarget);
    const formEmail = String(form.get("email") || "").trim();
    const formPassword = String(form.get("password") || "");

    setEmail(formEmail);
    setPassword(formPassword);

    try {
      if (isSignup) {
        await signUp(formEmail, formPassword);
      } else {
        await signIn(formEmail, formPassword);
      }
      navigate("/dashboard");
    } catch (err) {
      const code = err?.code || "";
      const message = friendlyError(code);
      setError(code ? `${message} (${code})` : message);
    } finally {
      setBusy(false);
    }
  };

  const handleSocialLogin = async (providerName) => {
    try {
      setError("");
      setBusy(true);
      setActiveProvider(providerName);
      await signInWithProvider(providerName);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        setError("Sign-in canceled. Please try again.");
        console.info("OAuth sign-in canceled:", err.code);
      } else {
        console.error("Social Auth Error:", err);
        const code = err?.code || "";
        const message =
          err?.friendlyMessage || friendlyError(code);
        setError(code ? `${message} (${code})` : message);
      }
    } finally {
      resetLoginState();
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950">
      {/* --- Ambient background --- */}
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="pointer-events-none absolute -left-32 top-[-10%] h-[34rem] w-[34rem] animate-drift rounded-full bg-brand-600/25 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-15%] right-[-10%] h-[32rem] w-[32rem] animate-drift rounded-full bg-sky-500/20 blur-[120px] [animation-delay:-7s]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[100px]" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-2 lg:gap-16 lg:px-8">
        {/* --- Left: brand / value panel (desktop) --- */}
        <div className="hidden animate-fade-in flex-col justify-center lg:flex">
          <div className="flex items-center gap-3">
            <LogoMark className="h-16 w-16" />
            <span className="text-4xl font-bold tracking-tight text-white xl:text-5xl">
              cand
              <span className="text-sky-400 [text-shadow:0_0_18px_rgba(95,189,240,0.45)]">
                AI
              </span>
              date
            </span>
          </div>

          <h1 className="mt-8 text-2xl font-extrabold leading-[1.2] tracking-tight text-white xl:text-3xl">
            Walk in
            <br />
            <span className="bg-gradient-to-r from-brand-400 to-sky-400 bg-clip-text text-transparent">
              already prepared.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-400">
            A personalized mock interview built from your resume and the role you
            want — a screening quiz, coding round, live AI interview, and holistic coaching scorecard.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              "Tailored to your resume & target job",
              "Real-time adaptive interview",
              "Objective feedback with a clear score",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-slate-300">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* --- Right: glass auth card --- */}
        <div className="flex animate-fade-in justify-center lg:justify-end">
          <div className="glass w-full max-w-md rounded-3xl p-7 sm:p-9">
            {/* Mobile brand */}
            <div className="mb-7 flex flex-col items-center text-center lg:hidden">
              <LogoMark className="mb-3 h-14 w-14" />
              <span className="text-xl font-bold tracking-tight text-white">
                cand
                <span className="text-sky-400 [text-shadow:0_0_18px_rgba(95,189,240,0.45)]">
                  AI
                </span>
                date
              </span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {isSignup ? "Create your account" : "Welcome back"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {isSignup
                  ? "Start practicing in under a minute."
                  : "Sign in to continue your prep."}
              </p>
            </div>

            {!isFirebaseConfigured && (
              <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Firebase not configured
                </p>
                <p className="mt-1 text-amber-200/80">{firebaseSetupMessage()}</p>
                {firebaseInitError && (
                  <p className="mt-2 text-xs text-amber-100/70">
                    Runtime error: {firebaseInitError.code || "unknown"}
                  </p>
                )}
              </div>
            )}

            {/* Mode toggle */}
            <div className="mb-6 flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  !isSignup
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  isSignup
                    ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-glass"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">
                  Password
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-glass"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !isFirebaseConfigured}
                className="btn-primary w-full"
              >
                {busy && <Spinner />}
                {isSignup ? "Create Account" : "Sign In"}
              </button>
            </form>

            {/* --- NEW: Social Authentication Buttons --- */}
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-sm text-slate-400">Or continue with</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleSocialLogin("google")}
                  disabled={busy || !isFirebaseConfigured}
                  className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm transition hover:bg-white/10 disabled:opacity-50"
                  aria-label="Sign in with Google"
                >
                  <FaGoogle className="h-5 w-5 text-slate-200" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSocialLogin("github")}
                  disabled={busy || !isFirebaseConfigured}
                  className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm transition hover:bg-white/10 disabled:opacity-50"
                  aria-label="Sign in with GitHub"
                >
                  <FaGithub className="h-5 w-5 text-slate-200" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSocialLogin("microsoft")}
                  disabled={busy || !isFirebaseConfigured}
                  className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-sm transition hover:bg-white/10 disabled:opacity-50"
                  aria-label="Sign in with Microsoft"
                >
                  <FaMicrosoft className="h-5 w-5 text-slate-200" />
                </button>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
              {isSignup ? "Already have an account?" : "New here?"}{" "}
              <button
                type="button"
                onClick={() => setMode(isSignup ? "signin" : "signup")}
                className="font-semibold text-brand-400 hover:text-brand-300"
              >
                {isSignup ? "Sign in" : "Create one"}
              </button>
            </p>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" /> Secured with Firebase Authentication
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}